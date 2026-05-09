/**
 * Authentication Service
 * Handles user signup, login, and token verification
 */
const jwt = require('jsonwebtoken');
const User = require('../models/postgres/User');
const logger = require('../utils/logger');
const { ConflictError, UnauthorizedError, ValidationError } = require('../utils/AppError');

// Require JWT_SECRET from environment - no fallback for security
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = '7d';

// Validate JWT_SECRET exists at startup
if (!JWT_SECRET) {
  logger.error('JWT_SECRET is not configured. Set JWT_SECRET environment variable.');
  throw new Error('JWT_SECRET environment variable is required');
}

if (JWT_SECRET.length < 32) {
  logger.warn('JWT_SECRET should be at least 32 characters for security');
}

/**
 * Register a new user
 * @param {Object} userData - { name, email, password }
 * @returns {Object} - { success, user, token, message }
 */
const signup = async (userData) => {
  const { name, email, password } = userData;

  // Check if user already exists
  const existingUser = await User.findOne({ where: { email } });
  if (existingUser) {
    throw new ConflictError('Email already registered');
  }

  // Create user (password hashed automatically by model hooks)
  const user = await User.create({ name, email, password });

  // Generate JWT token
  const token = generateToken(user);

  return {
    success: true,
    message: 'User registered successfully',
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
    token,
  };
};

/**
 * Authenticate user and return token
 * @param {Object} credentials - { email, password }
 * @returns {Object} - { success, user, token }
 */
const login = async (credentials) => {
  const { email, password } = credentials;

  // Find user by email
  const user = await User.findOne({ where: { email } });
  if (!user) {
    throw new UnauthorizedError('Invalid email or password');
  }

  // Verify password
  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    throw new UnauthorizedError('Invalid email or password');
  }

  // Generate JWT token
  const token = generateToken(user);

  return {
    success: true,
    message: 'Login successful',
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
    token,
  };
};

/**
 * Generate JWT token for user
 * @param {Object} user - User instance
 * @returns {string} - JWT token
 */
const generateToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
};

/**
 * Verify JWT token
 * @param {string} token - JWT token
 * @returns {Object} - Decoded token payload
 */
const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new UnauthorizedError('Token has expired');
    }
    if (error.name === 'JsonWebTokenError') {
      throw new UnauthorizedError('Invalid token');
    }
    throw new UnauthorizedError('Token verification failed');
  }
};

module.exports = {
  signup,
  login,
  generateToken,
  verifyToken,
};
