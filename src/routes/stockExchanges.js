const express = require('express');
const { body, param } = require('express-validator');
const stockExchangeController = require('../controllers/stockExchangeController');

const router = express.Router();

// Validation rules
const stockExchangeValidation = [
  body('name')
    .notEmpty()
    .withMessage('Stock exchange name is required')
    .trim()
    .isLength({ max: 100 })
    .withMessage('Stock exchange name cannot exceed 100 characters'),
  body('code')
    .notEmpty()
    .withMessage('Stock exchange code is required')
    .trim()
    .isLength({ max: 10 })
    .withMessage('Stock exchange code cannot exceed 10 characters'),
  body('country')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Country name cannot exceed 50 characters')
];

const idValidation = [
  param('id')
    .isMongoId()
    .withMessage('Invalid stock exchange ID')
];

// Routes
router.get('/', stockExchangeController.getStockExchanges);
router.post('/', stockExchangeValidation, stockExchangeController.createStockExchange);
router.put('/:id', idValidation, stockExchangeValidation, stockExchangeController.updateStockExchange);
router.delete('/:id', idValidation, stockExchangeController.deleteStockExchange);

module.exports = router;