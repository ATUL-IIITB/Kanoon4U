const { mongoose } = require('../../config/mongo');

/**
 * Post — MongoDB model (Mongoose)
 * Represents a learning feed post with tags and verification system
 *
 * Verification Levels:
 * - 'ai': AI-verified (automated content quality check)
 * - 'reviewed': Human-reviewed by moderator
 * - 'expert': Verified by legal expert (highest trust level)
 */
const postSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    summary: {
      type: String,
      required: [true, 'Summary is required'],
      maxlength: [2000, 'Summary cannot exceed 2000 characters'],
    },
    tags: {
      type: [String],
      default: [],
      validate: {
        validator: function (tags) {
          return tags.length <= 10;
        },
        message: 'Maximum 10 tags allowed',
      },
    },
    verified: {
      type: Boolean,
      default: false,
      index: true,
    },
    content: {
      type: String,
      default: '',
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    views: {
      type: Number,
      default: 0,
    },
    // Verification System Fields
    verificationLevel: {
      type: String,
      enum: {
        values: ['ai', 'reviewed', 'expert'],
        message: 'verificationLevel must be one of: ai, reviewed, expert',
      },
      default: 'ai',
      index: true,
    },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    verificationDate: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// ── Indexes ───────────────────────────────────────────────────
// Full-text search for RAG
postSchema.index({ title: 'text', summary: 'text' });
// Filter by tags
postSchema.index({ tags: 1 });
// Verified content sorted by date
postSchema.index({ verified: 1, createdAt: -1 });
// Compound index for filtered feeds
postSchema.index({ tags: 1, verified: 1, createdAt: -1 });
// Verification level filtering with date sorting
postSchema.index({ verificationLevel: 1, createdAt: -1 });
// Compound index for verified + level queries
postSchema.index({ verified: 1, verificationLevel: 1, createdAt: -1 });
// Expert-verified content prioritization
postSchema.index({ verificationLevel: 1, verified: 1, createdAt: -1 });

// ── Static Methods ────────────────────────────────────────────

/**
 * Get verification priority score for sorting
 * expert: 3, reviewed: 2, ai: 1, unverified: 0
 */
postSchema.statics.getVerificationPriority = function (level) {
  const priority = { expert: 3, reviewed: 2, ai: 1 };
  return priority[level] || 0;
};

// ── Instance Methods ──────────────────────────────────────────

/**
 * Mark post as verified
 * @param {ObjectId} verifiedBy - User ID who verified
 * @param {string} level - Verification level ('ai', 'reviewed', 'expert')
 */
postSchema.methods.markAsVerified = async function (verifiedBy, level = 'reviewed') {
  this.verified = true;
  this.verifiedBy = verifiedBy;
  this.verificationLevel = level;
  this.verificationDate = new Date();
  return this.save();
};

/**
 * Remove verification from post
 */
postSchema.methods.removeVerification = async function () {
  this.verified = false;
  this.verifiedBy = null;
  this.verificationLevel = 'ai';
  this.verificationDate = null;
  return this.save();
};

/**
 * Check if post has expert verification
 */
postSchema.methods.isExpertVerified = function () {
  return this.verified && this.verificationLevel === 'expert';
};

const Post = mongoose.model('Post', postSchema);

module.exports = Post;
