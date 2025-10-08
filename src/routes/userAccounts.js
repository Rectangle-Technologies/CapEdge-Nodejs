const express = require('express');
const { body, param, query } = require('express-validator');
const userAccountController = require('../controllers/userAccountController');

const router = express.Router();

// Validation rules
const userAccountValidation = [
  body('name')
    .notEmpty()
    .withMessage('User account name is required')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
  body('panNumber')
    .notEmpty()
    .withMessage('PAN number is required')
    .trim()
    .matches(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/i)
    .withMessage('Invalid PAN number format. Format: ABCDE1234F'),
  body('address')
    .notEmpty()
    .withMessage('Address is required')
    .trim()
    .isLength({ min: 10, max: 500 })
    .withMessage('Address must be between 10 and 500 characters'),
  body('email')
    .optional()
    .isEmail()
    .withMessage('Invalid email format'),
  body('phone')
    .optional()
    .matches(/^[6-9]\d{9}$/)
    .withMessage('Invalid phone number format')
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
router.get('/get-all', queryValidation, userAccountController.getUserAccounts);
router.post('/create', userAccountValidation, userAccountController.createUserAccount);
router.put('/update/:id', idValidation, userAccountValidation, userAccountController.updateUserAccount);
router.delete('/delete/:id', idValidation, userAccountController.deleteUserAccount);

module.exports = router;