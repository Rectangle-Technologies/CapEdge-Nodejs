const express = require('express');
const { body, param, query } = require('express-validator');
const transactionController = require('../controllers/transactionController');

const router = express.Router();

// Transaction types and delivery types
const transactionTypes = ['BUY', 'SELL'];
const deliveryTypes = ['Delivery', 'Intraday'];

// Validation rules
const transactionValidation = [
  body('date')
    .notEmpty()
    .withMessage('Transaction date is required')
    .isISO8601()
    .withMessage('Invalid date format')
    .custom((value) => {
      if (new Date(value) > new Date()) {
        throw new Error('Transaction date cannot be in the future');
      }
      return true;
    }),
  body('type')
    .notEmpty()
    .withMessage('Transaction type is required')
    .isIn(transactionTypes)
    .withMessage(`Transaction type must be one of: ${transactionTypes.join(', ')}`),
  body('quantity')
    .notEmpty()
    .withMessage('Quantity is required')
    .isInt({ min: 1 })
    .withMessage('Quantity must be a positive integer'),
  body('price')
    .notEmpty()
    .withMessage('Price is required')
    .isFloat({ min: 0.01 })
    .withMessage('Price must be greater than 0'),
  body('securityId')
    .notEmpty()
    .withMessage('Security ID is required')
    .isMongoId()
    .withMessage('Invalid security ID'),
  body('deliveryType')
    .notEmpty()
    .withMessage('Delivery type is required')
    .isIn(deliveryTypes)
    .withMessage(`Delivery type must be one of: ${deliveryTypes.join(', ')}`),
  body('dematAccountId')
    .notEmpty()
    .withMessage('Demat account ID is required')
    .isMongoId()
    .withMessage('Invalid demat account ID'),
  body('referenceNumber')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Reference number cannot exceed 100 characters')
];

const idValidation = [
  param('id')
    .isMongoId()
    .withMessage('Invalid transaction ID')
];

const queryValidation = [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('offset')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Offset must be a non-negative integer'),
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid start date format'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid end date format'),
  query('type')
    .optional()
    .isIn(transactionTypes)
    .withMessage(`Type must be one of: ${transactionTypes.join(', ')}`),
  query('securityId')
    .optional()
    .isMongoId()
    .withMessage('Invalid security ID'),
  query('dematAccountId')
    .optional()
    .isMongoId()
    .withMessage('Invalid demat account ID'),
  query('deliveryType')
    .optional()
    .isIn(deliveryTypes)
    .withMessage(`Delivery type must be one of: ${deliveryTypes.join(', ')}`)
];

// Routes
router.get('/', queryValidation, transactionController.getTransactions);
router.post('/', transactionValidation, transactionController.createTransaction);
router.put('/:id', idValidation, transactionValidation, transactionController.updateTransaction);
router.delete('/:id', idValidation, transactionController.deleteTransaction);

module.exports = router;