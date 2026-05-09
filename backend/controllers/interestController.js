/**
 * Interest Controller
 * Handles requests for user tag interest profiles.
 */
const { getUserInterests } = require('../services/interestService');
const { success } = require('../utils/apiResponse');
const { NotFoundError, ValidationError } = require('../utils/AppError');

const getInterests = async (req, res) => {
  const { userId } = req.params;

  // sortBy: 'count' (default) | 'recent'
  // limit: default 20, max 100
  let { sortBy = 'count', limit = 20 } = req.query;
  limit = Math.min(parseInt(limit, 10) || 20, 100);

  if (!['count', 'recent'].includes(sortBy)) {
    throw new ValidationError('sortBy must be "count" or "recent"');
  }

  const interests = await getUserInterests(userId, { sortBy, limit });

  return success(res, { userId, interests }, 'User interests retrieved');
};

module.exports = { getInterests };