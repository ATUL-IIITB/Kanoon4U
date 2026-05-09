/**
 * Activity Controller
 * Handles user activity tracking
 */
const { getUserActivity, getUserSummary } = require('../services/activityService');
const { success, paginated } = require('../utils/apiResponse');

/**
 * GET /api/activity/:userId
 * Query: ?type=post_viewed|quiz_attempted&page=1&limit=20
 */
const getActivity = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { type, page, limit } = req.query;

    const data = await getUserActivity(userId, {
      type,
      page: parseInt(page) || 1,
      limit: Math.min(parseInt(limit) || 20, 100),
    });

    return paginated(res, data.activities, {
      page: data.pagination.currentPage,
      limit: 20,
      total: data.pagination.total,
      totalPages: data.pagination.totalPages,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/activity/:userId/summary
 * Returns total posts viewed, total quiz attempts, avg score, best score
 */
const getSummary = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const summary = await getUserSummary(userId);
    return success(res, { userId, summary }, 'Activity summary retrieved');
  } catch (err) {
    next(err);
  }
};

module.exports = { getActivity, getSummary };
