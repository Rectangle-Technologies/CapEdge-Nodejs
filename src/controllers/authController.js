const { validationResult } = require('express-validator');
const authService = require('../services/authService');
const ApiResponse = require('../utils/response');

/**
 * Login user and generate JWT token
 * @route POST /auth/login
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const login = async (req, res, next) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const error = new Error(errors.array()[0].msg);
      error.statusCode = 422;
      error.reasonCode = 'BAD_REQUEST';
      error.field = errors.array()[0].path;
      error.errors = errors.array();
      throw error;
    }

    const result = await authService.login(req.body);

    return ApiResponse.success(res, result, 'Login successful');
  } catch (error) {
    next(error);
  }
};

/**
 * Validate JWT token
 * @route POST /auth/validate-token
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
const validateToken = async (req, res, next) => {
  try {
    return ApiResponse.success(res, { valid: true }, 'Token is valid');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  login,
  validateToken
};