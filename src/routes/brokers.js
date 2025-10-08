const express = require('express');
const { body, param, query } = require('express-validator');
const brokerController = require('../controllers/brokerController');

const router = express.Router();

// Validation rules
const brokerValidation = [
  body('name')
    .notEmpty()
    .withMessage('Broker name is required')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Broker name must be between 2 and 100 characters'),
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
    .withMessage('Address must be between 10 and 500 characters')
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
router.get('/', queryValidation, brokerController.getBrokers);
router.post('/', brokerValidation, brokerController.createBroker);
router.put('/:id', idValidation, brokerValidation, brokerController.updateBroker);
router.delete('/:id', idValidation, brokerController.deleteBroker);

module.exports = router;