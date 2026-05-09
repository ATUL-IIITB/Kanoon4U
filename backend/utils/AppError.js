/**
 * Custom Error Classes for Consistent Error Handling
 * All errors extend from AppError which includes status code and error code
 */

class AppError extends Error {
  constructor(message, statusCode, errorCode = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.isOperational = true; // Distinguish between operational and programming errors

    Error.captureStackTrace(this, this.constructor);
  }
}

// HTTP 400 - Bad Request
class ValidationError extends AppError {
  constructor(message = 'Validation error', errorCode = 'VALIDATION_ERROR') {
    super(message, 400, errorCode);
  }
}

// HTTP 401 - Unauthorized
class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized', errorCode = 'UNAUTHORIZED') {
    super(message, 401, errorCode);
  }
}

// HTTP 403 - Forbidden
class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', errorCode = 'FORBIDDEN') {
    super(message, 403, errorCode);
  }
}

// HTTP 404 - Not Found
class NotFoundError extends AppError {
  constructor(message = 'Resource not found', errorCode = 'NOT_FOUND') {
    super(message, 404, errorCode);
  }
}

// HTTP 409 - Conflict
class ConflictError extends AppError {
  constructor(message = 'Resource conflict', errorCode = 'CONFLICT') {
    super(message, 409, errorCode);
  }
}

// HTTP 422 - Unprocessable Entity
class UnprocessableEntityError extends AppError {
  constructor(message = 'Unprocessable entity', errorCode = 'UNPROCESSABLE_ENTITY') {
    super(message, 422, errorCode);
  }
}

// HTTP 429 - Too Many Requests
class RateLimitError extends AppError {
  constructor(message = 'Too many requests', errorCode = 'RATE_LIMIT_EXCEEDED') {
    super(message, 429, errorCode);
  }
}

// HTTP 500 - Internal Server Error
class InternalError extends AppError {
  constructor(message = 'Internal server error', errorCode = 'INTERNAL_ERROR') {
    super(message, 500, errorCode);
  }
}

// HTTP 502 - Bad Gateway (for external API failures)
class BadGatewayError extends AppError {
  constructor(message = 'Bad gateway', errorCode = 'BAD_GATEWAY') {
    super(message, 502, errorCode);
  }
}

// HTTP 503 - Service Unavailable
class ServiceUnavailableError extends AppError {
  constructor(message = 'Service unavailable', errorCode = 'SERVICE_UNAVAILABLE') {
    super(message, 503, errorCode);
  }
}

module.exports = {
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  UnprocessableEntityError,
  RateLimitError,
  InternalError,
  BadGatewayError,
  ServiceUnavailableError,
};
