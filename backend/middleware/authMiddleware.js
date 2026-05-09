/**
 * Authentication & Authorization Middleware
 * Verifies JWT tokens and checks user roles
 */
const authService = require('../services/authService');
const { UnauthorizedError, ForbiddenError } = require('../utils/AppError');

/**
 * Middleware to verify JWT token (strict — throws if missing or invalid).
 * Attaches decoded user payload to req.user.
 */
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];

  if (!authHeader) {
    throw new UnauthorizedError('Access denied. No token provided.');
  }

  const token = authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    throw new UnauthorizedError('Invalid token format. Use: Bearer <token>');
  }

  try {
    const decoded = authService.verifyToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    throw new UnauthorizedError(error.message || 'Invalid or expired token');
  }
};

/**
 * Optional auth — never throws.
 * If a valid Bearer token is present req.user is populated; otherwise
 * req.user is set to null and the request continues as a guest.
 *
 * Use on routes that are public but gain extra behaviour when authenticated
 * (e.g. personalised feed scoring, activity tracking).
 */
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers['authorization'];

  if (!authHeader) {
    req.user = null;
    return next();
  }

  const token = authHeader.split(' ')[1];

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    req.user = authService.verifyToken(token);
  } catch {
    // Invalid / expired token — treat as guest, don't error
    req.user = null;
  }

  next();
};

/**
 * Role-based authorisation — use after authenticateToken.
 * @param {...string} allowedRoles
 */
const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      throw new UnauthorizedError('Unauthorized');
    }

    if (!allowedRoles.includes(req.user.role)) {
      throw new ForbiddenError('Insufficient permissions');
    }

    next();
  };
};

module.exports = { authenticateToken, optionalAuth, authorizeRoles };
