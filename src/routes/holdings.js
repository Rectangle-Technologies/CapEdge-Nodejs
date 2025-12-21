const express = require('express');
const { query } = require('express-validator');
const holdingsController = require('../controllers/holdingsController');
const { handleValidationErrors } = require('../middleware/validation');

const router = express.Router();

// Validation rules for getting holdings
const getHoldingsValidation = [
  query('securityId')
    .optional()
    .isMongoId()
    .withMessage('Invalid security ID format'),
  query('dematAccountId')
    .optional()
    .isMongoId()
    .withMessage('Invalid demat account ID format'),
  query('userAccountId')
    .optional()
    .isMongoId()
    .withMessage('Invalid user account ID format'),
  query('financialYearId')
    .optional()
    .isMongoId()
    .withMessage('Invalid financial year ID format'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('pageNo')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page number must be at least 1')
];

/**
 * @route   GET /holdings
 * @desc    Get all holdings with optional filters
 * @access  Private
 * @query   {String} securityId - Filter by security ID (optional)
 * @query   {String} dematAccountId - Filter by demat account ID (optional)
 * @query   {String} userAccountId - Filter by user account ID (optional)
 * @query   {Number} limit - Number of records per page (optional)
 * @query   {Number} pageNo - Page number (optional, default: 1)
 */
router.get('/get-all', getHoldingsValidation, handleValidationErrors, holdingsController.getHoldings);

router.get('/for-split/:securityId', holdingsController.getHoldingsForSplit);

module.exports = router;
