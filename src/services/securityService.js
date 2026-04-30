const Security = require('../models/Security');
const Transaction = require('../models/Transaction');
const Holdings = require('../models/Holdings');
const { DERIVATIVE_TYPES, NON_DERIVATIVE_TYPES, SECURITY_TYPES_ARRAY } = require('../constants');
const mongoose = require('mongoose');

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

  // Sort splitHistory by splitDate for each security
  securities.forEach(security => {
    if (security.splitHistory && security.splitHistory.length > 0) {
      security.splitHistory.sort((a, b) => new Date(a.splitDate) - new Date(b.splitDate));
    }
  });

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

  const createdSecurity = await security.save();
  return createdSecurity;
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

const processSplit = async (payload) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { securityId, splitDate, splitRatio, transactions } = payload;

    // Fetch security
    const security = await Security.findById(securityId).session(session);
    if (!security) {
      const error = new Error('Security not found');
      error.statusCode = 404;
      throw error;
    }

    // Check that splitDate is after the latest transaction for this security
    const latestTransaction = await Transaction.findOne({ securityId })
      .sort({ date: -1 })
      .session(session);
    if (latestTransaction && new Date(splitDate) < latestTransaction.date) {
      const error = new Error('Split date cannot be before the latest transaction date for this security');
      error.statusCode = 400;
      throw error;
    }

    // Update each transaction and holdings
    for (let i = 0; i < transactions.length; i++) {
      const txData = transactions[i];

      const transaction = Transaction.findById(txData.transactionId).session(session);
      const holding = Holdings.findById(txData.holdingId).session(session);

      const [transactionResult, holdingResult] = await Promise.all([transaction, holding]);

      if (!holdingResult) {
        const error = new Error(`Holding not found: ${txData.holdingId}`);
        error.statusCode = 404;
        throw error;
      }

      if (!transactionResult) {
        const error = new Error(`Transaction not found: ${txData.transactionId}`);
        error.statusCode = 404;
        throw error;
      }

      // Check if transaction qty and holding qty match before split
      if (transactionResult.quantity > txData.quantityBeforeSplit) {
        // Split the transaction into two
        const soldQty = transactionResult.quantity - txData.quantityBeforeSplit;
        transactionResult.quantity = soldQty;

        // Create new transaction for split shares
        var newTrnDetails = {...transactionResult.toObject()};
        newTrnDetails.quantity = txData.quantityAfterSplit;
        newTrnDetails.price = txData.priceAfterSplit;
        delete newTrnDetails._id; delete newTrnDetails.id; delete newTrnDetails.createdAt; delete newTrnDetails.updatedAt;
        var newTransaction = new Transaction(newTrnDetails);
        
        // Update holding
        holdingResult.quantity = txData.quantityAfterSplit;
        holdingResult.price = txData.priceAfterSplit;
        
        // Save all changes
        var oldTrnSave = transactionResult.save({ session });
        var newTrnSave = newTransaction.save({ session });
        var [_oldTrn, newTrxn] = await Promise.all([oldTrnSave, newTrnSave]);

        // Link new transaction to holding
        txData.transactionId = newTrxn._id;
        holdingResult.transactionId = newTrxn._id;
        await holdingResult.save({ session });
      } else if (holdingResult.quantity > txData.quantityBeforeSplit) {
        const error = new Error(`Holding quantity mismatch for holding: ${txData.holdingId}`);
        error.statusCode = 400;
        throw error;
      } else {
        // Update transaction quantity and price
        transactionResult.quantity = txData.quantityAfterSplit;
        transactionResult.price = txData.priceAfterSplit;
        holdingResult.quantity = txData.quantityAfterSplit;
        holdingResult.price = txData.priceAfterSplit;

        var trnResult = transactionResult.save({ session });
        var holdingResultSave = holdingResult.save({ session });
        await Promise.all([trnResult, holdingResultSave]);
      }
    }

    // Add or merge split record into security history
    const existingSplitEntry = security.splitHistory.find(
      s => s.splitRatio === splitRatio &&
           new Date(s.splitDate).toISOString().split('T')[0] === new Date(splitDate).toISOString().split('T')[0]
    );
    if (existingSplitEntry) {
      existingSplitEntry.transactions.push(...transactions);
    } else {
      security.splitHistory.push({ splitDate, splitRatio, transactions });
    }

    await security.save({ session });

    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

module.exports = {
  getSecurities,
  createSecurity,
  bulkCreateSecurities,
  updateSecurity,
  deleteSecurity,
  processSplit
};
