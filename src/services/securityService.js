const Security = require('../models/Security');
const Transaction = require('../models/Transaction');
const Holdings = require('../models/Holdings');
const { DERIVATIVE_TYPES, NON_DERIVATIVE_TYPES, SECURITY_TYPES_ARRAY } = require('../constants');

/**
 * Security Service
 * Handles all business logic for securities management
 */

/**
 * Get all securities with optional filters and pagination
 * @param {Object} filters - { name, search, type, exchangeId, limit, pageNo }
 * @returns {Promise<Object>} - { securities, pagination }
 */
const getSecurities = async (filters = {}) => {
  const { name, search, type, limit, pageNo = 1 } = filters;
  
  // Calculate offset from pageNo and limit
  const offset = (pageNo - 1) * limit;
  
  // Build query
  const query = {};
  if (name) {
    // Match with any type of case and partial match
    query.name = { $regex: name, $options: 'i' };
  }
  if (search) {
    // Search in security name (case-insensitive partial match)
    query.name = { $regex: search, $options: 'i' };
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
  const { name, type, strikePrice, expiry } = updateData;

  // Check if security exists
  const security = await Security.findById(securityId);
  if (!security) {
    const error = new Error('Security not found');
    error.statusCode = 404;
    error.reasonCode = 'NOT_FOUND';
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

  // Check for duplicate security name
  const existingSecurity = await Security.findOne({ 
    _id: { $ne: securityId },
    name: name.trim(), 
    type 
  });
  if (existingSecurity) {
    const error = new Error('Another security with this name and type already exists');
    error.statusCode = 409;
    error.reasonCode = 'ALREADY_EXISTS';
    throw error;
  }

  // Update security
  security.name = name;
  security.strikePrice = DERIVATIVE_TYPES.includes(type) ? strikePrice : null;
  security.expiry = DERIVATIVE_TYPES.includes(type) ? expiry : null;

  await security.save();
  
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

  // Check for dependent holdings
  const holdingsCount = await Holdings.countDocuments({ securityId });
  if (holdingsCount > 0) {
    const error = new Error('Cannot delete security with existing holdings');
    error.statusCode = 400;
    throw error;
  }

  // Delete security
  await Security.findByIdAndDelete(securityId);
};

/**
 * Process stock split for a security
 * Updates all transactions based on payload with new quantities and prices
 * @param {String} securityId - Security ID
 * @param {Object} splitData - { splitDate, oldFaceValue, newFaceValue, transactions }
 * @param {Date} splitData.splitDate - Date of the split
 * @param {Number} splitData.oldFaceValue - Old face value before split
 * @param {Number} splitData.newFaceValue - New face value after split
 * @param {Array} splitData.transactions - Array of transaction updates
 * @param {String} splitData.transactions[].transactionId - Transaction ID to update
 * @param {Number} splitData.transactions[].oldQuantity - Original quantity
 * @param {Number} splitData.transactions[].newQuantity - New quantity after split
 * @param {Number} splitData.transactions[].oldPrice - Original price
 * @param {Number} splitData.transactions[].newPrice - New price after split
 * @returns {Promise<Object>} - { security, updatedTransactions, updatedHoldings }
 */
const processSplit = async (securityId, splitData) => {
  const { splitDate, oldFaceValue, newFaceValue, transactions } = splitData;

  // Validate security exists
  const security = await Security.findById(securityId);
  if (!security) {
    const error = new Error('Security not found');
    error.statusCode = 404;
    error.reasonCode = 'NOT_FOUND';
    throw error;
  }

  // Validate split data
  if (!splitDate || !oldFaceValue || !newFaceValue) {
    const error = new Error('Split date, old face value, and new face value are required');
    error.statusCode = 422;
    error.reasonCode = 'BAD_REQUEST';
    throw error;
  }

  if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
    const error = new Error('Transactions array is required and cannot be empty');
    error.statusCode = 422;
    error.reasonCode = 'BAD_REQUEST';
    throw error;
  }

  // Calculate split ratio (e.g., oldFaceValue=10, newFaceValue=2 => ratio is 1:5)
  const splitMultiplier = oldFaceValue / newFaceValue;
  const splitRatio = `1:${splitMultiplier}`;

  // Track updates
  let transactionsUpdated = 0;
  let holdingsUpdated = 0;
  const updatedTransactionIds = [];
  const failedUpdates = [];

  // Process each transaction update
  for (const txnUpdate of transactions) {
    const { transactionId, newQuantity, newPrice } = txnUpdate;

    if (!transactionId || newQuantity === undefined || newPrice === undefined) {
      failedUpdates.push({
        transactionId,
        reason: 'Missing required fields (transactionId, newQuantity, newPrice)'
      });
      continue;
    }

    try {
      // Update the transaction
      const transaction = await Transaction.findOneAndUpdate(
        { _id: transactionId, securityId },
        { 
          quantity: newQuantity,
          price: newPrice
        },
        { new: true }
      );

      if (transaction) {
        transactionsUpdated++;
        updatedTransactionIds.push(transactionId);

        // Update corresponding holding if exists
        const holding = await Holdings.findOneAndUpdate(
          { transactionId, securityId },
          {
            quantity: newQuantity,
            price: newPrice
          },
          { new: true }
        );

        if (holding) {
          holdingsUpdated++;
        }
      } else {
        failedUpdates.push({
          transactionId,
          reason: 'Transaction not found or does not belong to this security'
        });
      }
    } catch (err) {
      failedUpdates.push({
        transactionId,
        reason: err.message
      });
    }
  }

  // Add split history record to the security
  const splitHistoryRecord = {
    splitDate: new Date(splitDate),
    oldFaceValue,
    newFaceValue,
    splitRatio,
    transactionsUpdated,
    holdingsUpdated
  };

  security.splitHistory.push(splitHistoryRecord);
  await security.save();

  return {
    security,
    summary: {
      transactionsUpdated,
      holdingsUpdated,
      totalTransactionsProvided: transactions.length,
      failedUpdates: failedUpdates.length
    },
    failedUpdates: failedUpdates.length > 0 ? failedUpdates : undefined,
    splitHistory: splitHistoryRecord
  };
};

/**
 * Get all holdings for a security across all user accounts and demat accounts
 * @param {String} securityId - Security ID
 * @returns {Promise<Object>} - Holdings grouped by userAccount and dematAccount
 */
const getSecurityHoldingsForSplit = async (securityId) => {
  // Validate security exists
  const security = await Security.findById(securityId);
  if (!security) {
    const error = new Error('Security not found');
    error.statusCode = 404;
    error.reasonCode = 'NOT_FOUND';
    throw error;
  }

  // Get all holdings for this security with populated references
  const holdings = await Holdings.find({ securityId })
    .populate('securityId')
    .populate({
      path: 'dematAccountId',
      populate: [
        { path: 'brokerId' },
        { path: 'userAccountId' }
      ]
    })
    .populate('transactionId')
    .populate('financialYearId', 'title')
    .lean();

  // Get all transactions for this security
  const transactions = await Transaction.find({ securityId })
    .populate({
      path: 'dematAccountId',
      populate: [
        { path: 'brokerId' },
        { path: 'userAccountId' }
      ]
    })
    .populate('financialYearId', 'title')
    .sort({ date: 1 })
    .lean();

  return {
    security,
    holdings,
    transactions,
    summary: {
      totalHoldings: holdings.length,
      totalTransactions: transactions.length,
      totalHoldingQuantity: holdings.reduce((sum, h) => sum + h.quantity, 0)
    }
  };
};

module.exports = {
  getSecurities,
  createSecurity,
  bulkCreateSecurities,
  updateSecurity,
  deleteSecurity,
  processSplit,
  getSecurityHoldingsForSplit
};
