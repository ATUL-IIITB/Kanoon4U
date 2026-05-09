const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema(
  {
    userId: {
      type: String,          // ← was: mongoose.Schema.Types.ObjectId
      ref: 'User',           // ← keep or remove, harmless either way
      required: [true, 'userId is required'],
      index: true,
    },
    type: {
      type: String,
      enum: ['post_viewed', 'quiz_attempted'],
      required: [true, 'Activity type is required'],
    },
    metadata: {
      // post_viewed
      postId:    { type: String, default: null },   // ← was: ObjectId — Post IDs are Mongo ObjectIds
      postTitle: { type: String, default: null },   //    but safer as String to avoid cast errors

      // quiz_attempted
      score:      { type: Number, default: null },
      total:      { type: Number, default: null },
      percentage: { type: Number, default: null },
      grade:      { type: String, default: null },
    },
  },
  { timestamps: true }
);

activitySchema.index({ userId: 1, createdAt: -1 });
activitySchema.index({ userId: 1, type: 1, createdAt: -1 });

module.exports = mongoose.model('Activity', activitySchema);