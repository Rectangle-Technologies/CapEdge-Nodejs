const express = require('express');
const { body, param, query } = require('express-validator');
const securityController = require('../controllers/securityController');
const { SECURITY_TYPES_ARRAY } = require('../constants');
const { handleValidationErrors } = require('../middleware/validation');

const router = express.Router();

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
    .isIn(SECURITY_TYPES_ARRAY)
    .withMessage(`Security type must be one of: ${SECURITY_TYPES_ARRAY.join(', ')}`),
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

const splitValidation = [
  body('securityId')
    .notEmpty()
    .withMessage('Security ID is required')
    .isMongoId()
    .withMessage('Invalid security ID format'),
  body('splitDate')
    .notEmpty()
    .withMessage('Split date is required')
    .isISO8601()
    .withMessage('Split date must be a valid ISO 8601 date format')
    .custom((value) => {
      const splitDate = new Date(value);
      const today = new Date();
      today.setHours(23, 59, 59, 999); // End of today
      if (splitDate > today) {
        throw new Error('Split date cannot be a future date');
      }
      return true;
    }),
  body('splitRatio')
    .notEmpty()
    .withMessage('Split ratio is required')
    .isString()
    .withMessage('Split ratio must be a string')
    .trim(),
  body('transactions')
    .notEmpty()
    .withMessage('Transactions array is required')
    .isArray({ min: 1 })
    .withMessage('Transactions must be a non-empty array'),
  body('transactions.*.transactionId')
    .notEmpty()
    .withMessage('Transaction ID is required for each transaction')
    .isMongoId()
    .withMessage('Invalid transaction ID format'),
  body('transactions.*.holdingId')
    .notEmpty()
    .withMessage('Holding ID is required for each transaction')
    .isMongoId()
    .withMessage('Invalid holding ID format'),
  body('transactions.*.quantityBeforeSplit')
    .notEmpty()
    .withMessage('Quantity before split is required for each transaction')
    .isFloat({ min: 0 })
    .withMessage('Quantity before split must be a non-negative number'),
  body('transactions.*.quantityAfterSplit')
    .notEmpty()
    .withMessage('Quantity after split is required for each transaction')
    .isFloat({ min: 0 })
    .withMessage('Quantity after split must be a non-negative number'),
  body('transactions.*.priceBeforeSplit')
    .notEmpty()
    .withMessage('Price before split is required for each transaction')
    .isFloat({ min: 0 })
    .withMessage('Price before split must be a non-negative number'),
  body('transactions.*.priceAfterSplit')
    .notEmpty()
    .withMessage('Price after split is required for each transaction')
    .isFloat({ min: 0 })
    .withMessage('Price after split must be a non-negative number')
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
    .isIn(SECURITY_TYPES_ARRAY)
    .withMessage(`Type must be one of: ${SECURITY_TYPES_ARRAY.join(', ')}`),
  query('search')
    .optional()
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Search term must be between 1 and 200 characters')
];

// Routes
router.get('/get-all', queryValidation, handleValidationErrors, securityController.getSecurities);
router.post('/create', securityValidation, handleValidationErrors, securityController.createSecurity);
router.post('/bulk-create', securityController.bulkCreateSecurities);
router.put('/update/:id', idValidation, securityValidation, handleValidationErrors, securityController.updateSecurity);
router.delete('/delete/:id', idValidation, handleValidationErrors, securityController.deleteSecurity);

// Stock split routes
router.post('/split', splitValidation, handleValidationErrors, securityController.processSplit);

module.exports = router;