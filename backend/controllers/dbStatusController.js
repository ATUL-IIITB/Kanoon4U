/**
 * Database Status Controller
 * Returns live connection status for both databases
 */
const dbStatusService = require('../services/dbStatusService');
const { success } = require('../utils/apiResponse');
const { ServiceUnavailableError } = require('../utils/AppError');

/**
 * GET /api/db-status
 * Returns live connection status for both databases.
 */
const getDbStatus = async (req, res, next) => {
  try {
    const status = await dbStatusService.getStatus();
    const allOk = Object.values(status.databases).every((db) => db.status === 'connected');

    if (!allOk) {
      throw new ServiceUnavailableError('Database connection issues detected');
    }

    return success(res, status);
  } catch (error) {
    next(error);
  }
};

module.exports = { getDbStatus };
