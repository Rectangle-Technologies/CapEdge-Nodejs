const Security = require('../models/Security');
const Transaction = require('../models/Transaction');
const { DERIVATIVE_TYPES, NON_DERIVATIVE_TYPES, SECURITY_TYPES_ARRAY } = require('../constants');

/**
 * Security Service
 * Handles all business logic for securities management
 */

/**
 * Get all securities with optional filters and pagination
 * @param {Object} filters - { name, type, exchangeId, limit, pageNo }
 * @returns {Promise<Object>} - { securities, pagination }
 */
const getSecurities = async (filters = {}) => {
  const { name, type, limit, pageNo = 1 } = filters;
  
  // Calculate offset from pageNo and limit
  const offset = (pageNo - 1) * limit;
  
  // Build query
  const query = {};
  if (name) {
    query.name = { $regex: name, $options: 'i' };
  }
  if (type) {
    query.type = type;
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
    securityTypes: SECURITY_TYPES_ARRAY,
    pagination: {
      total,
      count: securities.length,
      limit: parseInt(limit),
      pageNo: parseInt(pageNo)
    }
  };
};

/**
 * Create a new security
 * @param {Object} securityData - { name, type, strikePrice, expiry, stockExchangeId }
 * @returns {Promise<Object>} - Created security
 */
const createSecurity = async (securityData) => {
  const { name, type, strikePrice, expiry, stockExchangeId } = securityData;

  // Validate derivative-specific fields
  if (DERIVATIVE_TYPES.includes(type)) {
    // Require strike price and expiry for derivatives
    if (!strikePrice || !expiry) {
      const error = new Error('Strike price and expiry are required for OPTIONS and FUTURES');
      error.statusCode = 422;
      error.reasonCode = 'BAD_REQUEST';
      error.field = !strikePrice ? 'strikePrice' : 'expiry';
      throw error;
    }

    // Validate expiry is in future
    if (new Date(expiry) <= new Date()) {
      const error = new Error('Expiry date must be in the future for derivatives');
      error.statusCode = 422;
      error.reasonCode = 'BAD_REQUEST';
      error.field = 'expiry';
      throw error;
    }
  } else if (NON_DERIVATIVE_TYPES.includes(type)) {
    // Ensure strike price and expiry are null for non-derivatives
    if (strikePrice !== undefined || expiry !== undefined) {
      const error = new Error('Strike price and expiry should be null for non-derivative securities');
      error.statusCode = 422;
      error.reasonCode = 'BAD_REQUEST';
      error.field = strikePrice !== undefined ? 'strikePrice' : 'expiry';
      throw error;
    }
  }

  // Check for duplicate security name
  const existingSecurity = await Security.findOne({ name: name.trim(), type });
  if (existingSecurity) {
    const error = new Error('Security with this name and type already exists');
    error.statusCode = 409;
    error.reasonCode = 'ALREADY_EXISTS';
    throw error;
  }

  // Create security
  const security = new Security({
    name,
    type,
    strikePrice: DERIVATIVE_TYPES.includes(type) ? strikePrice : null,
    expiry: DERIVATIVE_TYPES.includes(type) ? expiry : null
  });

  await security.save();
  return security;
};

/**
 * Bulk create securities from an array
 * @param {Array} securitiesData - Array of security objects
 * @returns {Promise<Object>} - { created, failed, summary }
 */
const bulkCreateSecurities = async (securitiesData) => {
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

  return results;
};

/**
 * Update an existing security
 * @param {String} securityId - Security ID
 * @param {Object} updateData - { name, type, strikePrice, expiry, stockExchangeId }
 * @returns {Promise<Object>} - Updated security
 */
const updateSecurity = async (securityId, updateData) => {
  const { name, type, strikePrice, expiry, stockExchangeId } = updateData;

  // Check if security exists
  const security = await Security.findById(securityId);
  if (!security) {
    const error = new Error('Security not found');
    error.statusCode = 404;
    throw error;
  }

  // Validate derivative-specific fields
  if (DERIVATIVE_TYPES.includes(type)) {
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
  } else if (NON_DERIVATIVE_TYPES.includes(type)) {
    if (strikePrice !== undefined || expiry !== undefined) {
      const error = new Error('Strike price and expiry should be null for non-derivative securities');
      error.statusCode = 400;
      throw error;
    }
  }

  // Update security
  security.name = name;
  security.type = type;
  security.strikePrice = DERIVATIVE_TYPES.includes(type) ? strikePrice : null;
  security.expiry = DERIVATIVE_TYPES.includes(type) ? expiry : null;
  security.stockExchangeId = stockExchangeId;

  await security.save();
  await security.populate('stockExchangeId', 'name code country');
  
  return security;
};

/**
 * Delete a security
 * @param {String} securityId - Security ID
 * @returns {Promise<void>}
 */
const deleteSecurity = async (securityId) => {
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
};

module.exports = {
  getSecurities,
  createSecurity,
  bulkCreateSecurities,
  updateSecurity,
  deleteSecurity
};
