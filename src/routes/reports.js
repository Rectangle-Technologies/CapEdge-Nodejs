const express = require('express');
const { body, query } = require('express-validator');
const reportController = require('../controllers/reportController');
const { handleValidationErrors } = require('../middleware/validation');

const router = express.Router();

const pnlValidation = [
  body('financialYearId')
    .notEmpty().withMessage('Financial Year ID is required')
    .isMongoId().withMessage('Invalid Financial Year ID'),
  body('dematAccountId')
    .notEmpty().withMessage('Demat Account ID is required')
    .isMongoId().withMessage('Invalid Demat Account ID')
];

// Query validation
const ledgerQueryValidation = [
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid start date format'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid end date format')
];

// P&L Report Routes
router.post('/pnl/export', pnlValidation, handleValidationErrors, reportController.exportPnLReport);

// All holdings Report Routes
router.get('/holdings/export', reportController.exportHoldingsReport);

// Ledger
router.get('/ledger/export/:dematAccountId', ledgerQueryValidation, handleValidationErrors, reportController.exportLedgerReport);

module.exports = router;