/**
 * Security Middleware
 * Combines helmet, CORS, rate limiting, and request size limits
 */
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');

// CORS configuration
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  maxAge: 86400, // 24 hours
};

// Rate limiter for general API endpoints
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: {
    success: false,
    message: 'Too many requests, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict rate limiter for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: {
    success: false,
    message: 'Too many login attempts, please try again after 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict rate limiter for chat endpoints (expensive OpenAI calls)
const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 requests per window
  message: {
    success: false,
    message: 'Too many chat requests, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Request size limiter
const requestSizeLimiter = (req, res, next) => {
  const maxSize = 10 * 1024; // 10KB
  const contentLength = parseInt(req.headers['content-length'], 10);

  if (contentLength && contentLength > maxSize) {
    return res.status(413).json({
      success: false,
      message: 'Request body too large. Maximum size is 10KB.',
    });
  }
  next();
};

// Main security middleware composer
const securityMiddleware = [
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
  }),
  cors(corsOptions),
  // Manual sanitize — Express 5 made req.query read-only, middleware version crashes
  (req, res, next) => {
    if (req.body) req.body = mongoSanitize.sanitize(req.body, { replaceWith: '_' });
    if (req.params) req.params = mongoSanitize.sanitize(req.params, { replaceWith: '_' });
    next();
  },
  requestSizeLimiter,
  generalLimiter,
];

module.exports = {
  securityMiddleware,
  authLimiter,
  chatLimiter,
  corsOptions,
};
