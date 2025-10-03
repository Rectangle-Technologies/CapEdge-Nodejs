const { validationResult } = require('express-validator');
const stockExchangeService = require('../services/stockExchangeService');
const logger = require('../utils/logger');

/**
 * Get all stock exchanges
 * @route GET /stock-exchanges
 */
const getStockExchanges = async (req, res, next) => {
  try {
    const stockExchanges = await stockExchangeService.getStockExchanges();

    res.json({
      success: true,
      data: { stockExchanges },
      message: 'Stock exchanges retrieved successfully'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new stock exchange
 * @route POST /stock-exchanges
 */
const createStockExchange = async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const { name, code, country = 'India' } = req.body;

    const stockExchange = new StockExchange({
      name: name.trim(),
      code: code.trim().toUpperCase(),
      country: country.trim()
    });

    await stockExchange.save();

    logger.info('Stock exchange created successfully', { stockExchangeId: stockExchange._id, code });

    res.status(201).json({
      success: true,
      data: { stockExchange },
      message: 'Stock exchange created successfully'
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Stock exchange code already exists'
      });
    }
    
    logger.error('Create stock exchange error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Update an existing stock exchange
 * @route PUT /stock-exchanges/:id
 */
const updateStockExchange = async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const { id } = req.params;
    const { name, code, country } = req.body;

    const stockExchange = await StockExchange.findByIdAndUpdate(
      id,
      {
        name: name.trim(),
        code: code.trim().toUpperCase(),
        country: country.trim()
      },
      { new: true, runValidators: true }
    );

    if (!stockExchange) {
      return res.status(404).json({
        success: false,
        message: 'Stock exchange not found'
      });
    }

    logger.info('Stock exchange updated successfully', { stockExchangeId: id, code });

    res.json({
      success: true,
      data: { stockExchange },
      message: 'Stock exchange updated successfully'
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Stock exchange code already exists'
      });
    }
    
    logger.error('Update stock exchange error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Delete a stock exchange
 * @route DELETE /stock-exchanges/:id
 */
const deleteStockExchange = async (req, res) => {
  try {
    const { id } = req.params;

    const stockExchange = await StockExchange.findByIdAndDelete(id);

    if (!stockExchange) {
      return res.status(404).json({
        success: false,
        message: 'Stock exchange not found'
      });
    }

    logger.info('Stock exchange deleted successfully', { stockExchangeId: id, code: stockExchange.code });

    res.json({
      success: true,
      message: 'Stock exchange deleted successfully'
    });
  } catch (error) {
    logger.error('Delete stock exchange error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

module.exports = {
  getStockExchanges,
  createStockExchange,
  updateStockExchange,
  deleteStockExchange
};