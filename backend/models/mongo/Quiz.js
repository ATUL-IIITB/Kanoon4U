const mongoose = require('mongoose');

const quizSchema = new mongoose.Schema(
  {
    question: {
      type: String,
      required: [true, 'Question is required'],
      trim: true,
    },
    options: {
      type: [String],
      required: [true, 'Options are required'],
      validate: {
        validator: (arr) => arr.length >= 2 && arr.length <= 6,
        message: 'Options must have between 2 and 6 choices',
      },
    },
    answer: {
      type: String,
      required: [true, 'Answer is required'],
      validate: {
        validator: function (val) {
          return this.options.includes(val);
        },
        message: 'Answer must be one of the provided options',
      },
    },
    explanation: {
      type: String,
      required: [true, 'Explanation is required'],
      trim: true,
    },
    difficulty: {
      type: String,
      enum: ['easy', 'medium', 'hard'],
      default: 'medium',
    },
    tags: { type: [String], default: [] },
    category: { type: String, trim: true, default: 'General' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

quizSchema.index({ tags: 1 });
quizSchema.index({ difficulty: 1 });
quizSchema.index({ category: 1 });
quizSchema.index({ isActive: 1, createdAt: -1 });

module.exports = mongoose.model('Quiz', quizSchema);