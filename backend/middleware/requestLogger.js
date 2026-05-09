/**
 * Request Logger Middleware
 * Logs all incoming requests with timing and generates request IDs for tracing
 */
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

// Generate unique request ID
const generateRequestId = () => {
  return uuidv4();
};

// Request logger middleware
const requestLogger = (req, res, next) => {
  // Start time for response time calculation
  const startTime = Date.now();

  // Generate and attach request ID
  req.requestId = generateRequestId();

  // Get client IP (handle proxy scenarios)
  const getClientIp = () => {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }
    return req.socket?.remoteAddress || 'unknown';
  };

  // Log the incoming request
  logger.info('Incoming request', {
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    query: req.query,
    ip: getClientIp(),
    userAgent: req.headers['user-agent'],
    userId: req.user?.id || 'anonymous',
  });

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - startTime;

    // Determine log level based on status code
    let logLevel = 'info';
    if (res.statusCode >= 500) {
      logLevel = 'error';
    } else if (res.statusCode >= 400) {
      logLevel = 'warn';
    }

    logger[logLevel]('Request completed', {
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      userId: req.user?.id || 'anonymous',
    });
  });

  next();
};

module.exports = requestLogger;
