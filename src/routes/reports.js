const express = require('express');
const { body } = require('express-validator');
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

// P&L Report Routes
router.post('/pnl/export', pnlValidation, handleValidationErrors, reportController.exportPnLReport);

// All holdings Report Routes
router.get('/holdings/export', reportController.exportHoldingsReport);

module.exports = router;