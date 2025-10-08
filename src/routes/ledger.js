const express = require('express');
const { query } = require('express-validator');
const ledgerController = require('../controllers/ledgerController');

const router = express.Router();

// Query validation
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
  query('dematAccountId')
    .optional()
    .isMongoId()
    .withMessage('Invalid demat account ID'),
  query('transactionType')
    .optional()
    .isIn(['BUY', 'SELL', 'CREDIT', 'DEBIT'])
    .withMessage('Invalid transaction type'),
  query('format')
    .optional()
    .isIn(['csv', 'excel'])
    .withMessage('Format must be either csv or excel')
];

// Routes
router.get('/', queryValidation, ledgerController.getLedgerEntries);
router.get('/export', queryValidation, ledgerController.exportLedger);

module.exports = router;