const DematAccount = require('../models/DematAccount');
const UserAccount = require('../models/UserAccount');
const Broker = require('../models/Broker');
const Transaction = require('../models/Transaction');
const logger = require('../utils/logger');

/**
 * Demat Account Service
 * Handles all business logic for demat account management
 */

/**
 * Get all demat accounts with optional filters and pagination
 * @param {Object} filters - { userAccountId, brokerId, limit, offset }
 * @returns {Promise<Object>} - { dematAccounts, pagination }
 */
const getDematAccounts = async (filters = {}) => {
  try {
    const { userAccountId, brokerId, limit = 50, offset = 0 } = filters;
    
    // Build query
    const query = {};
    if (userAccountId) {
      query.userAccountId = userAccountId;
    }
    if (brokerId) {
      query.brokerId = brokerId;
    }

    // Get total count
    const total = await DematAccount.countDocuments(query);

    // Fetch demat accounts with populated references
    const dematAccounts = await DematAccount.find(query)
      .populate('userAccountId', 'name panNumber address')
      .populate('brokerId', 'name panNumber address')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset))
      .lean();

    return {
      dematAccounts,
      pagination: {
        total,
        count: dematAccounts.length,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    };
  } catch (error) {
    logger.error('Error in getDematAccounts service:', error);
    throw error;
  }
};

/**
 * Create a new demat account
 * @param {Object} accountData - { userAccountId, brokerId, balance }
 * @returns {Promise<Object>} - Created demat account
 */
const createDematAccount = async (accountData) => {
  try {
    const { userAccountId, brokerId, balance } = accountData;

    // Validate user account exists
    const userAccount = await UserAccount.findById(userAccountId);
    if (!userAccount) {
      const error = new Error('User account not found');
      error.statusCode = 404;
      throw error;
    }

    // Validate broker exists
    const broker = await Broker.findById(brokerId);
    if (!broker) {
      const error = new Error('Broker not found');
      error.statusCode = 404;
      throw error;
    }

    // Optional: Check if user-broker combination already exists
    const existingAccount = await DematAccount.findOne({
      userAccountId,
      brokerId
    });

    if (existingAccount) {
      const error = new Error('Demat account already exists for this user-broker combination');
      error.statusCode = 400;
      throw error;
    }

    // Create demat account
    const dematAccount = new DematAccount({
      userAccountId,
      brokerId,
      balance: parseFloat(balance)
    });

    await dematAccount.save();
    
    // Populate references
    await dematAccount.populate('userAccountId', 'name panNumber address');
    await dematAccount.populate('brokerId', 'name panNumber address');
    
    logger.info(`Demat account created: ${dematAccount._id}`);
    return dematAccount;
  } catch (error) {
    logger.error('Error in createDematAccount service:', error);
    throw error;
  }
};

/**
 * Update an existing demat account
 * @param {String} accountId - Demat Account ID
 * @param {Object} updateData - { userAccountId, brokerId, balance }
 * @returns {Promise<Object>} - Updated demat account
 */
const updateDematAccount = async (accountId, updateData) => {
  try {
    const { userAccountId, brokerId, balance } = updateData;

    // Check if demat account exists
    const dematAccount = await DematAccount.findById(accountId);
    if (!dematAccount) {
      const error = new Error('Demat account not found');
      error.statusCode = 404;
      throw error;
    }

    // Validate user account exists
    const userAccount = await UserAccount.findById(userAccountId);
    if (!userAccount) {
      const error = new Error('User account not found');
      error.statusCode = 404;
      throw error;
    }

    // Validate broker exists
    const broker = await Broker.findById(brokerId);
    if (!broker) {
      const error = new Error('Broker not found');
      error.statusCode = 404;
      throw error;
    }

    // Check if user-broker combination already exists (excluding current account)
    if (userAccountId !== dematAccount.userAccountId.toString() || 
        brokerId !== dematAccount.brokerId.toString()) {
      const existingAccount = await DematAccount.findOne({
        userAccountId,
        brokerId,
        _id: { $ne: accountId }
      });

      if (existingAccount) {
        const error = new Error('Another demat account already exists for this user-broker combination');
        error.statusCode = 400;
        throw error;
      }
    }

    // Update demat account
    dematAccount.userAccountId = userAccountId;
    dematAccount.brokerId = brokerId;
    dematAccount.balance = parseFloat(balance);

    await dematAccount.save();
    await dematAccount.populate('userAccountId', 'name panNumber address');
    await dematAccount.populate('brokerId', 'name panNumber address');
    
    logger.info(`Demat account updated: ${dematAccount._id}`);
    return dematAccount;
  } catch (error) {
    logger.error('Error in updateDematAccount service:', error);
    throw error;
  }
};

/**
 * Delete a demat account
 * @param {String} accountId - Demat Account ID
 * @returns {Promise<void>}
 */
const deleteDematAccount = async (accountId) => {
  try {
    // Check if demat account exists
    const dematAccount = await DematAccount.findById(accountId);
    if (!dematAccount) {
      const error = new Error('Demat account not found');
      error.statusCode = 404;
      throw error;
    }

    // Check for dependent transactions
    const transactionCount = await Transaction.countDocuments({ 
      dematAccountId: accountId 
    });
    
    if (transactionCount > 0) {
      const error = new Error('Cannot delete demat account with associated transactions');
      error.statusCode = 400;
      throw error;
    }

    // Delete demat account
    await DematAccount.findByIdAndDelete(accountId);
    logger.info(`Demat account deleted: ${accountId}`);
  } catch (error) {
    logger.error('Error in deleteDematAccount service:', error);
    throw error;
  }
};

module.exports = {
  getDematAccounts,
  createDematAccount,
  updateDematAccount,
  deleteDematAccount
};
