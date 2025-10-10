const express = require('express');
const rateLimit = require('express-rate-limit');
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/auth');
const ApiResponse = require('../utils/response');

const router = express.Router();

// Rate limiting for login endpoint
const loginLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000, // 1 minute
  max: parseInt(process.env.LOGIN_RATE_LIMIT_MAX) || 5, // 5 attempts per minute
  handler: (req, res) => {
    return ApiResponse.error(res, 'Too many login attempts, please try again later.', 429, 'RATE_LIMIT_EXCEEDED');
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Validation rules
const loginValidation = [
  body('username')
    .notEmpty()
    .withMessage('Username is required')
    .trim(),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .trim()
];

// Routes
router.post('/login', loginLimiter, loginValidation, authController.login);
router.post('/validate-token', authMiddleware, authController.validateToken);

module.exports = router;