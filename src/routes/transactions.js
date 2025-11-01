const express = require('express');
const { body, param, query } = require('express-validator');
const transactionController = require('../controllers/transactionController');
const { handleValidationErrors } = require('../middleware/validation');

const router = express.Router();

// Transaction types and delivery types
const transactionTypes = ['BUY', 'SELL'];
const deliveryTypes = ['Delivery', 'Intraday'];

// Validation rules
const transactionValidation = [
  body('*.date')
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
  body('*.type')
    .notEmpty()
    .withMessage('Transaction type is required')
    .isIn(transactionTypes)
    .withMessage(`Transaction type must be one of: ${transactionTypes.join(', ')}`),
  body('*.quantity')
    .notEmpty()
    .withMessage('Quantity is required')
    .isInt({ min: 1 })
    .withMessage('Quantity must be a positive integer'),
  body('*.price')
    .custom((value, { req, path }) => {
      // Extract the index from the path (e.g., "[0].price" -> 0)
      const index = path.match(/\[(\d+)\]/)?.[1];
      const deliveryType = req.body[index]?.deliveryType;
      
      // Price is required only for Delivery type
      if (deliveryType === 'Delivery') {
        if (!value) {
          throw new Error('Price is required for Delivery type transactions');
        }
        if (typeof value !== 'number' || value <= 0) {
          throw new Error('Price must be greater than 0');
        }
      }
      return true;
    }),
  body('*.buyPrice')
    .custom((value, { req, path }) => {
      // Extract the index from the path (e.g., "[0].buyPrice" -> 0)
      const index = path.match(/\[(\d+)\]/)?.[1];
      const deliveryType = req.body[index]?.deliveryType;
      
      // Buy price is required only for Intraday type
      if (deliveryType === 'Intraday') {
        if (!value) {
          throw new Error('Buy price is required for Intraday type transactions');
        }
        if (typeof value !== 'number' || value <= 0) {
          throw new Error('Buy price must be greater than 0');
        }
      }
      return true;
    }),
  body('*.sellPrice')
    .custom((value, { req, path }) => {
      // Extract the index from the path (e.g., "[0].sellPrice" -> 0)
      const index = path.match(/\[(\d+)\]/)?.[1];
      const deliveryType = req.body[index]?.deliveryType;
      
      // Sell price is required only for Intraday type
      if (deliveryType === 'Intraday') {
        if (!value) {
          throw new Error('Sell price is required for Intraday type transactions');
        }
        if (typeof value !== 'number' || value <= 0) {
          throw new Error('Sell price must be greater than 0');
        }
      }
      return true;
    }),
  body('*.securityId')
    .notEmpty()
    .withMessage('Security ID is required')
    .isMongoId()
    .withMessage('Invalid security ID'),
  body('*.deliveryType')
    .notEmpty()
    .withMessage('Delivery type is required')
    .isIn(deliveryTypes)
    .withMessage(`Delivery type must be one of: ${deliveryTypes.join(', ')}`),
  body('*.dematAccountId')
    .notEmpty()
    .withMessage('Demat account ID is required')
    .isMongoId()
    .withMessage('Invalid demat account ID'),
  body('*.referenceNumber')
    .notEmpty()
    .withMessage('Reference number is required')
    .trim()
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
  query('pageNo')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page number must be a positive integer'),
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
router.get('/get-all', queryValidation, handleValidationErrors, transactionController.getTransactions);
router.post('/create', transactionValidation, handleValidationErrors, transactionController.createTransactions);
router.put('/update/:id', idValidation, transactionValidation, handleValidationErrors, transactionController.updateTransaction);
router.delete('/delete/:id', idValidation, handleValidationErrors, transactionController.deleteTransaction);

module.exports = router;