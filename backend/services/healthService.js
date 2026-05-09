/**
 * Health Service
 * Encapsulates business logic for the health check endpoint.
 */
const logger = require('../utils/logger');

const getStatus = () => {
  logger.debug('Health check requested');
  return {
    success: true,
    status: 'OK',
    app: process.env.APP_NAME || 'Express API',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    uptime: `${Math.floor(process.uptime())}s`,
  };
};

module.exports = { getStatus };
