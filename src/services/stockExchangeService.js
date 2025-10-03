const StockExchange = require('../models/StockExchange');
const logger = require('../utils/logger');

/**
 * Stock Exchange Service
 * Handles all business logic for stock exchange management
 */

/**
 * Get all stock exchanges
 * @returns {Promise<Array>} - Array of stock exchanges
 */
const getStockExchanges = async () => {
  try {
    const stockExchanges = await StockExchange.find()
      .sort({ code: 1 })
      .lean();

    return stockExchanges;
  } catch (error) {
    logger.error('Error in getStockExchanges service:', error);
    throw error;
  }
};

/**
 * Create a new stock exchange
 * @param {Object} exchangeData - { name, code, country }
 * @returns {Promise<Object>} - Created stock exchange
 */
const createStockExchange = async (exchangeData) => {
  try {
    const { name, code, country } = exchangeData;

    // Check if code already exists
    const existingExchange = await StockExchange.findOne({ 
      code: code.toUpperCase() 
    });
    
    if (existingExchange) {
      const error = new Error('Stock exchange with this code already exists');
      error.statusCode = 400;
      throw error;
    }

    // Create stock exchange
    const stockExchange = new StockExchange({
      name,
      code: code.toUpperCase(),
      country
    });

    await stockExchange.save();
    logger.info(`Stock exchange created: ${stockExchange._id}`);

    return stockExchange;
  } catch (error) {
    logger.error('Error in createStockExchange service:', error);
    throw error;
  }
};

/**
 * Update an existing stock exchange
 * @param {String} exchangeId - Stock Exchange ID
 * @param {Object} updateData - { name, code, country }
 * @returns {Promise<Object>} - Updated stock exchange
 */
const updateStockExchange = async (exchangeId, updateData) => {
  try {
    const { name, code, country } = updateData;

    // Check if stock exchange exists
    const stockExchange = await StockExchange.findById(exchangeId);
    if (!stockExchange) {
      const error = new Error('Stock exchange not found');
      error.statusCode = 404;
      throw error;
    }

    // Check if code is being changed and if it's unique
    if (code && code.toUpperCase() !== stockExchange.code) {
      const existingExchange = await StockExchange.findOne({ 
        code: code.toUpperCase(),
        _id: { $ne: exchangeId }
      });
      
      if (existingExchange) {
        const error = new Error('Another stock exchange with this code already exists');
        error.statusCode = 400;
        throw error;
      }
    }

    // Update stock exchange
    stockExchange.name = name;
    stockExchange.code = code.toUpperCase();
    stockExchange.country = country;

    await stockExchange.save();
    logger.info(`Stock exchange updated: ${stockExchange._id}`);

    return stockExchange;
  } catch (error) {
    logger.error('Error in updateStockExchange service:', error);
    throw error;
  }
};

/**
 * Delete a stock exchange
 * @param {String} exchangeId - Stock Exchange ID
 * @returns {Promise<void>}
 */
const deleteStockExchange = async (exchangeId) => {
  try {
    const Security = require('../models/Security'); // Lazy load to avoid circular dependency

    // Check if stock exchange exists
    const stockExchange = await StockExchange.findById(exchangeId);
    if (!stockExchange) {
      const error = new Error('Stock exchange not found');
      error.statusCode = 404;
      throw error;
    }

    // Check for dependent securities
    const securityCount = await Security.countDocuments({ stockExchangeId: exchangeId });
    if (securityCount > 0) {
      const error = new Error('Cannot delete stock exchange with associated securities');
      error.statusCode = 400;
      throw error;
    }

    // Delete stock exchange
    await StockExchange.findByIdAndDelete(exchangeId);
    logger.info(`Stock exchange deleted: ${exchangeId}`);
  } catch (error) {
    logger.error('Error in deleteStockExchange service:', error);
    throw error;
  }
};

module.exports = {
  getStockExchanges,
  createStockExchange,
  updateStockExchange,
  deleteStockExchange
};
