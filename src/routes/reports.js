const express = require('express');
const { query } = require('express-validator');
const reportController = require('../controllers/reportController');

const router = express.Router();

// Query validation for reports
const reportQueryValidation = [
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
  query('format')
    .optional()
    .isIn(['csv', 'excel'])
    .withMessage('Format must be either csv or excel')
];

const pnlQueryValidation = [
  ...reportQueryValidation,
  query('capitalGainType')
    .optional()
    .isIn(['STCG', 'LTCG'])
    .withMessage('Capital gain type must be either STCG or LTCG')
];

const holdingsQueryValidation = [
  ...reportQueryValidation,
  query('securityType')
    .optional()
    .isIn(['EQUITY', 'FUTURES', 'OPTIONS', 'COMMODITY', 'CURRENCY', 'BOND', 'ETF', 'MUTUAL_FUND'])
    .withMessage('Invalid security type')
];

// P&L Report Routes
router.get('/pnl', pnlQueryValidation, reportController.getPnLReport);
router.get('/pnl/export', pnlQueryValidation, reportController.exportPnLReport);

// Holdings Report Routes
router.get('/holdings', holdingsQueryValidation, reportController.getHoldingsReport);
router.get('/holdings/export', holdingsQueryValidation, reportController.exportHoldingsReport);

module.exports = router;