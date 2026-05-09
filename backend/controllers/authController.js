/**
 * Authentication Controller
 * Handles user signup and login
 */
const authService = require('../services/authService');
const { created, success } = require('../utils/apiResponse');

/**
 * POST /api/auth/signup
 */
const signup = async (req, res, next) => {
  try {
    const result = await authService.signup(req.body);
    return created(res, { ...result.user, token: result.token }, result.message);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/auth/login
 */
const login = async (req, res, next) => {
  try {
    const result = await authService.login(req.body);
    return success(res, { ...result.user, token: result.token }, result.message);
  } catch (error) {
    next(error);
  }
};

module.exports = { signup, login };