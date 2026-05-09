/**
 * Centralized Error Handler Middleware
 * Handles all errors consistently and logs them appropriately
 */
const logger = require('../utils/logger');
const { AppError } = require('../utils/AppError');

// 404 Handler for undefined routes
const notFoundHandler = (req, res, next) => {
  const error = new AppError(
    `Route ${req.originalUrl} not found`,
    404,
    'ROUTE_NOT_FOUND'
  );
  next(error);
};

// Main error handler
const errorHandler = (err, req, res, next) => {
  // Generate request ID for tracing (if not already set by requestLogger)
  const requestId = req.requestId || 'unknown';

  // Log the error with full context
  logger.error('Error occurred:', {
    requestId,
    userId: req.user?.id || 'anonymous',
    method: req.method,
    path: req.path,
    error: {
      name: err.name,
      message: err.message,
      stack: err.stack,
      statusCode: err.statusCode,
      errorCode: err.errorCode,
      isOperational: err.isOperational,
    },
  });

  // Handle known operational errors
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      errorCode: err.errorCode,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
  }

  // Handle Mongoose validation errors
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errorCode: 'VALIDATION_ERROR',
      errors,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
  }

  // Handle Mongoose duplicate key errors
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern)[0];
    return res.status(409).json({
      success: false,
      message: `${field} already exists`,
      errorCode: 'DUPLICATE_KEY',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
  }

  // Handle Mongoose CastError (invalid ObjectId)
  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: `Invalid ${err.path}: ${err.value}`,
      errorCode: 'INVALID_ID',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
  }

  // Handle Sequelize validation errors
  if (err.name === 'SequelizeValidationError') {
    const errors = err.errors.map((e) => ({
      field: e.path,
      message: e.message,
    }));
    return res.status(400).json({
      success: false,
      message: 'Database validation error',
      errorCode: 'DB_VALIDATION_ERROR',
      errors,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
  }

  // Handle Sequelize unique constraint errors
  if (err.name === 'SequelizeUniqueConstraintError') {
    const field = err.errors[0]?.path || 'field';
    return res.status(409).json({
      success: false,
      message: `${field} must be unique`,
      errorCode: 'UNIQUE_CONSTRAINT',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Invalid token',
      errorCode: 'INVALID_TOKEN',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      message: 'Token expired',
      errorCode: 'TOKEN_EXPIRED',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
  }

  // Handle OpenAI errors
  if (err.message?.includes('OpenAI') || err.message?.includes('api error')) {
    return res.status(502).json({
      success: false,
      message: 'AI service temporarily unavailable',
      errorCode: 'EXTERNAL_SERVICE_ERROR',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
  }

  // Fallback for unknown errors - don't expose internal details in production
  const isDev = process.env.NODE_ENV === 'development';
  return res.status(err.statusCode || 500).json({
    success: false,
    message: isDev ? err.message : 'Internal server error',
    errorCode: 'INTERNAL_ERROR',
    ...(isDev && { stack: err.stack }),
  });
};

// Global unhandled rejection handler
const handleUncaughtExceptions = () => {
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception:', {
      message: err.message,
      stack: err.stack,
    });
    // Graceful shutdown
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection:', {
      reason: reason?.message || reason,
      stack: reason?.stack,
    });
  });
};

module.exports = {
  notFoundHandler,
  errorHandler,
  handleUncaughtExceptions,
};
