const { validationResult } = require('express-validator');
const authService = require('../services/authService');
const logger = require('../utils/logger');

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
      return res.status(422).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
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
    // Extract token from Authorization header
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({
        success: false,
        data: { valid: false },
        message: 'No token provided'
      });
    }

    const result = await authService.validateToken(token);
    
    if (result.valid) {
      res.json({
        success: true,
        data: result,
        message: 'Token is valid'
      });
    } else {
      res.json({
        success: false,
        data: result,
        message: result.message
      });
    }
  } catch (error) {
    next(error);
  }
};

module.exports = {
  login,
  validateToken
};