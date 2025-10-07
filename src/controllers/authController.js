const { validationResult } = require('express-validator');
const authService = require('../services/authService');

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
      throw {
        statusCode: 422,
        message: errors.array()[0].msg,
        reasonCode: 'BAD_REQUEST',
        field: errors.array()[0].path
      };
    }

    const result = await authService.login(req.body);

    res.json({
      success: true,
      data: result,
      message: 'Login successful'
    });
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
      res.json({
        success: true,
        data: {
          valid: true,
        },
        message: 'Token is valid'
      });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  login,
  validateToken
};