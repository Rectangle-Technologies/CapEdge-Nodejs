const Security = require('../models/Security');
const Transaction = require('../models/Transaction');
const StockExchange = require('../models/StockExchange');
const logger = require('../utils/logger');

/**
 * Security Service
 * Handles all business logic for securities management
 */

/**
 * Get all securities with optional filters and pagination
 * @param {Object} filters - { name, type, exchangeId, limit, offset }
 * @returns {Promise<Object>} - { securities, pagination }
 */
const getSecurities = async (filters = {}) => {
  try {
    const { name, type, exchangeId, limit = 50, offset = 0 } = filters;
    
    // Build query
    const query = {};
    if (name) {
      query.name = { $regex: name, $options: 'i' };
    }
    if (type) {
      query.type = type;
    }
    if (exchangeId) {
      query.stockExchangeId = exchangeId;
    }

    // Get total count
    const total = await Security.countDocuments(query);

    // Fetch securities with stock exchange details
    const securities = await Security.find(query)
      .sort({ name: 1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset))
      .lean();

    return {
      securities,
      pagination: {
        total,
        count: securities.length,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    };
  } catch (error) {
    logger.error('Error in getSecurities service:', error);
    throw error;
  }
};

/**
 * Create a new security
 * @param {Object} securityData - { name, type, strikePrice, expiry, stockExchangeId }
 * @returns {Promise<Object>} - Created security
 */
const createSecurity = async (securityData) => {
  try {
    const { name, type, strikePrice, expiry, stockExchangeId } = securityData;

    // Validate derivative-specific fields
    const derivativeTypes = ['OPTIONS', 'FUTURES'];
    const nonDerivativeTypes = ['EQUITY', 'BOND', 'ETF', 'MUTUAL_FUND', 'COMMODITY', 'CURRENCY'];

    if (derivativeTypes.includes(type)) {
      // Require strike price and expiry for derivatives
      if (!strikePrice || !expiry) {
        const error = new Error('Strike price and expiry are required for OPTIONS and FUTURES');
        error.statusCode = 400;
        throw error;
      }

      // Validate expiry is in future
      if (new Date(expiry) <= new Date()) {
        const error = new Error('Expiry date must be in the future for derivatives');
        error.statusCode = 400;
        throw error;
      }
    } else if (nonDerivativeTypes.includes(type)) {
      // Ensure strike price and expiry are null for non-derivatives
      console.log('Non-derivative security creation:', { type, strikePrice, expiry });
      if (strikePrice !== undefined || expiry !== undefined) {
        const error = new Error('Strike price and expiry should be null for non-derivative securities');
        error.statusCode = 400;
        throw error;
      }
    }

    // Create security
    const security = new Security({
      name,
      type,
      strikePrice: derivativeTypes.includes(type) ? strikePrice : null,
      expiry: derivativeTypes.includes(type) ? expiry : null,
      symbol: securityData.symbol,
      stockExchangeId
    });

    await security.save();
    
    logger.info(`Security created: ${security._id}`);
    return security;
  } catch (error) {
    logger.error('Error in createSecurity service:', error);
    throw error;
  }
};

/**
 * Bulk create securities from an array
 * @param {Array} securitiesData - Array of security objects
 * @returns {Promise<Object>} - { created, failed, summary }
 */
const bulkCreateSecurities = async (securitiesData) => {
  try {
    const results = {
      created: [],
      failed: [],
      summary: {
        total: securitiesData.length,
        successful: 0,
        failed: 0
      }
    };

    // Process each security
    for (let i = 0; i < securitiesData.length; i++) {
      const item = securitiesData[i];
      createSecurity(item)
        .then(security => {
          console.log(`Successfully created security: ${security.name}`);
        })
    }

    logger.info(`Bulk security creation completed: ${results.summary.successful} successful, ${results.summary.failed} failed`);
    return results;

  } catch (error) {
    logger.error('Error in bulkCreateSecurities service:', error);
    throw error;
  }
};

/**
 * Update an existing security
 * @param {String} securityId - Security ID
 * @param {Object} updateData - { name, type, strikePrice, expiry, stockExchangeId }
 * @returns {Promise<Object>} - Updated security
 */
const updateSecurity = async (securityId, updateData) => {
  try {
    const { name, type, strikePrice, expiry, stockExchangeId } = updateData;

    // Check if security exists
    const security = await Security.findById(securityId);
    if (!security) {
      const error = new Error('Security not found');
      error.statusCode = 404;
      throw error;
    }

    // Validate stock exchange exists
    const exchange = await StockExchange.findById(stockExchangeId);
    if (!exchange) {
      const error = new Error('Stock exchange not found');
      error.statusCode = 404;
      throw error;
    }

    // Validate derivative-specific fields
    const derivativeTypes = ['OPTIONS', 'FUTURES'];
    const nonDerivativeTypes = ['EQUITY', 'BOND', 'ETF', 'MUTUAL_FUND', 'COMMODITY', 'CURRENCY'];

    if (derivativeTypes.includes(type)) {
      if (!strikePrice || !expiry) {
        const error = new Error('Strike price and expiry are required for OPTIONS and FUTURES');
        error.statusCode = 400;
        throw error;
      }

      if (new Date(expiry) <= new Date()) {
        const error = new Error('Expiry date must be in the future for derivatives');
        error.statusCode = 400;
        throw error;
      }
    } else if (nonDerivativeTypes.includes(type)) {
      if (strikePrice !== undefined || expiry !== undefined) {
        const error = new Error('Strike price and expiry should be null for non-derivative securities');
        error.statusCode = 400;
        throw error;
      }
    }

    // Update security
    security.name = name;
    security.type = type;
    security.strikePrice = derivativeTypes.includes(type) ? strikePrice : null;
    security.expiry = derivativeTypes.includes(type) ? expiry : null;
    security.stockExchangeId = stockExchangeId;

    await security.save();
    await security.populate('stockExchangeId', 'name code country');
    
    logger.info(`Security updated: ${security._id}`);
    return security;
  } catch (error) {
    logger.error('Error in updateSecurity service:', error);
    throw error;
  }
};

/**
 * Delete a security
 * @param {String} securityId - Security ID
 * @returns {Promise<void>}
 */
const deleteSecurity = async (securityId) => {
  try {
    // Check if security exists
    const security = await Security.findById(securityId);
    if (!security) {
      const error = new Error('Security not found');
      error.statusCode = 404;
      throw error;
    }

    // Check for dependent transactions
    const transactionCount = await Transaction.countDocuments({ securityId });
    if (transactionCount > 0) {
      const error = new Error('Cannot delete security with associated transactions');
      error.statusCode = 400;
      throw error;
    }

    // Delete security
    await Security.findByIdAndDelete(securityId);
    logger.info(`Security deleted: ${securityId}`);
  } catch (error) {
    logger.error('Error in deleteSecurity service:', error);
    throw error;
  }
};

module.exports = {
  getSecurities,
  createSecurity,
  bulkCreateSecurities,
  updateSecurity,
  deleteSecurity
};
