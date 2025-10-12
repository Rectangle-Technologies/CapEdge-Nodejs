const express = require('express');
const { body, param, query } = require('express-validator');
const securityController = require('../controllers/securityController');

const router = express.Router();

// Security types
const securityTypes = ['EQUITY', 'FUTURES', 'OPTIONS', 'COMMODITY', 'CURRENCY', 'BOND', 'ETF', 'MUTUAL_FUND'];

// Validation rules
const securityValidation = [
  body('name')
    .notEmpty()
    .withMessage('Security name is required')
    .trim()
    .isLength({ min: 2, max: 200 })
    .withMessage('Security name must be between 2 and 200 characters'),
  body('type')
    .notEmpty()
    .withMessage('Security type is required')
    .isIn(securityTypes)
    .withMessage(`Security type must be one of: ${securityTypes.join(', ')}`),
  body('strikePrice')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Strike price must be a positive number'),
  body('expiry')
    .optional()
    .isISO8601()
    .withMessage('Invalid expiry date format')
];

const idValidation = [
  param('id')
    .isMongoId()
    .withMessage('Invalid security ID')
];

const queryValidation = [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('pageNo')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page number must be a positive integer'),
  query('type')
    .optional()
    .isIn(securityTypes)
    .withMessage(`Type must be one of: ${securityTypes.join(', ')}`)
];

// Routes
router.get('/get-all', queryValidation, securityController.getSecurities);
router.post('/create', securityValidation, securityController.createSecurity);
router.post('/bulk-create', securityController.bulkCreateSecurities);
router.put('/update/:id', idValidation, securityValidation, securityController.updateSecurity);
router.delete('/delete/:id', idValidation, securityController.deleteSecurity);

module.exports = router;