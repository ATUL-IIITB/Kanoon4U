/**
 * Health Controller
 * Returns server health status
 */
const healthService = require('../services/healthService');
const { success } = require('../utils/apiResponse');

/**
 * GET /api/health
 * Returns the current health status of the server.
 */
const getHealth = (req, res) => {
  const status = healthService.getStatus();
  return success(res, status);
};

module.exports = { getHealth };
