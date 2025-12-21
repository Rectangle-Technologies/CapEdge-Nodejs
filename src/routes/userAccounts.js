const express = require('express');
const { body, param, query } = require('express-validator');
const userAccountController = require('../controllers/userAccountController');
const { handleValidationErrors } = require('../middleware/validation');

const router = express.Router();

// Validation rules
const userAccountValidation = [
  body('name')
    .notEmpty()
    .withMessage('User account name is required')
    .trim(),
  body('panNumber')
    .trim(),
  body('address')
    .trim()
];

const idValidation = [
  param('id')
    .isMongoId()
    .withMessage('Invalid user account ID')
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
  query('includeDematAccounts')
    .optional()
    .isBoolean()
    .withMessage('includeDematAccounts must be a boolean')
];

// Routes
router.get('/get-all', queryValidation, handleValidationErrors, userAccountController.getUserAccounts);
router.post('/create', userAccountValidation, handleValidationErrors, userAccountController.createUserAccount);
router.put('/update/:id', idValidation, userAccountValidation, handleValidationErrors, userAccountController.updateUserAccount);
router.delete('/delete/:id', idValidation, handleValidationErrors, userAccountController.deleteUserAccount);

module.exports = router;