const express = require('express');
const { query, body, param } = require('express-validator');
const ledgerController = require('../controllers/ledgerController');
const { handleValidationErrors } = require('../middleware/validation');

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
  query('transactionType')
    .optional()
    .isIn(['BUY', 'SELL', 'CREDIT', 'DEBIT'])
    .withMessage('Invalid transaction type'),
  query('format')
    .optional()
    .isIn(['csv', 'excel'])
    .withMessage('Format must be either csv or excel')
];

const addLedgerEntryValidation = [
  body('dematAccountId')
    .notEmpty()
    .withMessage('Demat account ID is required')
    .isMongoId()
    .withMessage('Invalid Demat account ID'),
  body('transactionAmount')
    .notEmpty()
    .withMessage('Transaction amount is required')
    .isFloat()
    .withMessage('Transaction amount must be a number')
    .custom((value) => value !== 0)
    .withMessage('Transaction amount cannot be zero'),
  body('date')
    .notEmpty()
    .withMessage('Date is required')
    .isISO8601()
    .withMessage('Invalid date format'),
  body('remarks')
    .notEmpty()
    .withMessage('Remarks are required')
    .isString()
    .withMessage('Remarks must be a string')
];

// Routes
router.get('/all-closing-balances', ledgerController.getAllClosingBalances);
router.get('/get/:dematAccountId', queryValidation, handleValidationErrors, ledgerController.getLedgerEntries);
router.post('/add', addLedgerEntryValidation, handleValidationErrors, ledgerController.addLedgerEntry);
router.delete('/:id', [param('id').isMongoId().withMessage('Invalid ledger entry ID')], handleValidationErrors, ledgerController.deleteLedgerEntry);
router.get('/export', queryValidation, handleValidationErrors, ledgerController.exportLedger);
router.post('/fix', ledgerController.fixLedgerEntries);
router.put('/edit/:id', [
  param('id').isMongoId().withMessage('Invalid ledger entry ID'),
  ...addLedgerEntryValidation
], handleValidationErrors, ledgerController.editLedgerEntry);

module.exports = router;