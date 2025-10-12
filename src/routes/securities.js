const express = require('express');
const { body, param, query } = require('express-validator');
const securityController = require('../controllers/securityController');
const { SECURITY_TYPES_ARRAY } = require('../constants');

const router = express.Router();

// Validation rules
const securityValidation = [
  body('name')
    .notEmpty()
    .withMessage('Security name is required')
    .trim()
    .isLength({ min: 2, max: 200 })
    .withMessage('Security name must be between 2 and 200 characters'),
  body('type')
    .notEmpty()
    .withMessage('Security type is required')
    .isIn(SECURITY_TYPES_ARRAY)
    .withMessage(`Security type must be one of: ${SECURITY_TYPES_ARRAY.join(', ')}`),
  body('strikePrice')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Strike price must be a positive number'),
  body('expiry')
    .optional()
    .isISO8601()
    .withMessage('Invalid expiry date format')
];

const idValidation = [
  param('id')
    .isMongoId()
    .withMessage('Invalid security ID')
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
  query('type')
    .optional()
    .isIn(SECURITY_TYPES_ARRAY)
    .withMessage(`Type must be one of: ${SECURITY_TYPES_ARRAY.join(', ')}`)
];

// Routes
router.get('/get-all', queryValidation, securityController.getSecurities);
router.post('/create', securityValidation, securityController.createSecurity);
router.post('/bulk-create', securityController.bulkCreateSecurities);
router.put('/update/:id', idValidation, securityValidation, securityController.updateSecurity);
router.delete('/delete/:id', idValidation, securityController.deleteSecurity);

module.exports = router;