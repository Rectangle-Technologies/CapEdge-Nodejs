const express = require('express');
const { body, param, query } = require('express-validator');
const dematAccountController = require('../controllers/dematAccountController');

const router = express.Router();

// Validation rules
const dematAccountValidation = [
  body('userAccountId')
    .notEmpty()
    .withMessage('User account ID is required')
    .isMongoId()
    .withMessage('Invalid user account ID'),
  body('brokerId')
    .notEmpty()
    .withMessage('Broker ID is required')
    .isMongoId()
    .withMessage('Invalid broker ID'),
  body('balance')
    .notEmpty()
    .withMessage('Balance is required')
    .isFloat({ min: 0 })
    .withMessage('Balance must be a non-negative number'),
  body('accountNumber')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Account number cannot exceed 50 characters')
];

const idValidation = [
  param('id')
    .isMongoId()
    .withMessage('Invalid demat account ID')
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
  query('userAccountId')
    .optional()
    .isMongoId()
    .withMessage('Invalid user account ID'),
  query('brokerId')
    .optional()
    .isMongoId()
    .withMessage('Invalid broker ID')
];

// Routes
router.get('/', queryValidation, dematAccountController.getDematAccounts);
router.post('/', dematAccountValidation, dematAccountController.createDematAccount);
router.put('/:id', idValidation, dematAccountValidation, dematAccountController.updateDematAccount);
router.delete('/:id', idValidation, dematAccountController.deleteDematAccount);

module.exports = router;