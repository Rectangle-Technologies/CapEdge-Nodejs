const express = require('express');
const { body, param, query } = require('express-validator');
const brokerController = require('../controllers/brokerController');
const { handleValidationErrors } = require('../middleware/validation');

const router = express.Router();

// Validation rules
const brokerValidation = [
  body('name')
    .notEmpty()
    .withMessage('Broker name is required')
    .trim(),
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
];

const idValidation = [
  param('id')
    .isMongoId()
    .withMessage('Invalid broker ID')
];

const queryValidation = [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('pageNo')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page number must be a positive integer')
];

// Routes
router.get('/get-all', queryValidation, handleValidationErrors, brokerController.getBrokers);
router.post('/create', brokerValidation, handleValidationErrors, brokerController.createBroker);
router.put('/update/:id', idValidation, brokerValidation, handleValidationErrors, brokerController.updateBroker);
router.delete('/delete/:id', idValidation, handleValidationErrors, brokerController.deleteBroker);

module.exports = router;