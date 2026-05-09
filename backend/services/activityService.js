const Activity = require('../models/mongo/Activity');
const logger = require('../utils/logger');
const { ValidationError } = require('../utils/AppError');

const logActivity = async (userId, type, metadata = {}) => {
  try {
    if (!userId || !type) {
      logger.warn('logActivity called with missing userId or type');
      return;
    }
    await Activity.create({ userId, type, metadata });
  } catch (err) {
    logger.debug('Failed to log activity', { userId, type, error: err.message });
  }
};

const getUserActivity = async (userId, { type, limit = 20, page = 1 } = {}) => {
  if (!userId) {
    throw new ValidationError('userId is required');
  }
  const query = { userId };
  if (type) query.type = type;
  const skip = (page - 1) * limit;
  const [activities, total] = await Promise.all([
    Activity.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Activity.countDocuments(query),
  ]);
  return {
    activities,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      total,
    },
  };
};

const getUserSummary = async (userId) => {
  if (!userId) {
    throw new ValidationError('userId is required');
  }

  // REMOVED: mongoose.Types.ObjectId.isValid() check — userId is a plain
  // Postgres integer string like "2", not a Mongo ObjectId. It will never
  // pass that check and always throws "Invalid userId format".

  const [postsViewed, quizStats] = await Promise.all([
    Activity.countDocuments({ userId, type: 'post_viewed' }),
    Activity.aggregate([
      // FIXED: match userId as plain String — no ObjectId casting
      { $match: { userId: String(userId), type: 'quiz_attempted' } },
      {
        $group: {
          _id: null,
          attempts: { $sum: 1 },
          avgScore: { $avg: '$metadata.percentage' },
          bestScore: { $max: '$metadata.percentage' },
        },
      },
    ]),
  ]);

  const quiz = quizStats[0] || { attempts: 0, avgScore: 0, bestScore: 0 };
  return {
    postsViewed,
    quizAttempts: quiz.attempts,
    avgQuizScore: Math.round(quiz.avgScore || 0),
    bestQuizScore: Math.round(quiz.bestScore || 0),
  };
};

module.exports = { logActivity, getUserActivity, getUserSummary };