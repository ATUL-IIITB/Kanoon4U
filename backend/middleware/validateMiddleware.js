/**
 * Input Validation Middleware
 * Wraps express-validator with custom error handling
 */
const { validationResult, body, param, query } = require('express-validator');
const { ValidationError } = require('../utils/AppError');

/**
 * Middleware to check validation results
 * Must be placed after validation chain
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map((err) => ({
      field: err.path,
      message: err.msg,
      value: err.value,
    }));

    const error = new ValidationError('Validation failed');
    error.errors = formattedErrors;
    return next(error);
  }

  next();
};

/**
 * Common validation rules
 */
const rules = {
  // Email validation
  email: body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Invalid email format')
    .normalizeEmail(),

  // Password validation (strong password required)
  password: body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 8, max: 128 }).withMessage('Password must be 8-128 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain uppercase, lowercase, number, and special character'),

  // Name validation
  name: body('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 1, max: 100 }).withMessage('Name must be 1-100 characters')
    .matches(/^[a-zA-Z\s'-]+$/).withMessage('Name can only contain letters, spaces, hyphens, and apostrophes'),

  // Question validation (for chat)
  question: body('question')
    .trim()
    .notEmpty().withMessage('Question is required')
    .isLength({ min: 5, max: 2000 }).withMessage('Question must be 5-2000 characters'),

    question: body('question')
    .trim()
    .notEmpty().withMessage('Question is required')
    .customSanitizer(value =>
      typeof value === 'string'
        ? value.replace(/[\x00-\x1F\x7F]/g, ' ').replace(/\s+/g, ' ').trim()
        : value
    )
    .isLength({ min: 10, max: 500 }).withMessage('Question must be 10–500 characters'),

  // MongoDB ObjectId validation
  objectId: (fieldName = 'id') =>
    param(fieldName)
      .trim()
      .notEmpty().withMessage('ID is required')
      .matches(/^[0-9a-fA-F]{24}$/).withMessage('Invalid MongoDB ObjectId'),

  // Pagination validation
  page: query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page must be a positive integer')
    .toInt(),

  limit: query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
    .toInt(),
};

/**
 * Validation chains for common scenarios
 */
const validation = {
  // Signup validation
  signup: [rules.name, rules.email, rules.password, validate],

  // Login validation
  login: [rules.email, rules.password, validate],

  // Chat validation
  chat: [rules.question, validate],

  // ObjectId param validation
  objectId: (fieldName = 'id') => [rules.objectId(fieldName), validate],

  // Pagination validation
  pagination: [rules.page, rules.limit, validate],
};

module.exports = {
  validate,
  rules,
  validation,
};
