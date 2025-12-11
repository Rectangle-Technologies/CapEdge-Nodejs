const DematAccount = require('../models/DematAccount');
const UserAccount = require('../models/UserAccount');
const Broker = require('../models/Broker');
const Transaction = require('../models/Transaction');
const LedgerEntry = require('../models/LedgerEntry');
const Holdings = require('../models/Holdings');
const FinancialYear = require('../models/FinancialYear');
const { addLedgerEntry } = require('./ledgerService');

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
  const { userAccountId, brokerId, limit, pageNo = 1 } = filters;
  
  // Calculate offset from pageNo and limit
  const offset = (pageNo - 1) * limit;
  
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
      pageNo: parseInt(pageNo)
    }
  };
};

/**
 * Create a new demat account
 * @param {Object} accountData - { userAccountId, brokerId, balance }
 * @returns {Promise<Object>} - Created demat account
 */
const createDematAccount = async (accountData) => {
  const { userAccountId, brokerId, balance } = accountData;

  // Validate user account exists
  const userAccount = await UserAccount.findById(userAccountId);
  if (!userAccount) {
    const error = new Error('User account not found');
    error.statusCode = 404;
    error.reasonCode = 'NOT_FOUND';
    throw error;
  }

  // Validate broker exists
  const broker = await Broker.findById(brokerId);
  if (!broker) {
    const error = new Error('Broker not found');
    error.statusCode = 404;
    error.reasonCode = 'NOT_FOUND';
    throw error;
  }

  // Optional: Check if user-broker combination already exists
  const existingAccount = await DematAccount.findOne({
    userAccountId,
    brokerId
  });

  if (existingAccount) {
    const error = new Error('Demat account already exists for this user-broker combination');
    error.statusCode = 409;
    error.reasonCode = 'ALREADY_EXISTS';
    throw error;
  }

  // Create demat account
  const dematAccount = new DematAccount({
    userAccountId,
    brokerId,
    balance: parseFloat(balance)
  });

  await dematAccount.save();

  // Add a ledger entry for initial balance if balance > 0
  if (parseFloat(balance) > 0) {
    await addLedgerEntry({
      dematAccountId: dematAccount._id,
      transactionAmount: parseFloat(balance),
      date: new Date()
    });
  }
  
  // Populate references
  await dematAccount.populate('userAccountId', 'name panNumber address');
  await dematAccount.populate('brokerId', 'name panNumber address');
  
  return dematAccount;
};

/**
 * Update an existing demat account
 * @param {String} accountId - Demat Account ID
 * @param {Object} updateData - { userAccountId, brokerId, balance }
 * @returns {Promise<Object>} - Updated demat account
 */
const updateDematAccount = async (accountId, updateData) => {
  const { userAccountId, brokerId, balance } = updateData;

  // Check if demat account exists
  const dematAccount = await DematAccount.findById(accountId);
  if (!dematAccount) {
    const error = new Error('Demat account not found');
    error.statusCode = 404;
    error.reasonCode = 'NOT_FOUND';
    throw error;
  }

  // Update demat account
  dematAccount.balance = parseFloat(balance);

  await dematAccount.save();
  await dematAccount.populate('userAccountId', 'name panNumber address');
  await dematAccount.populate('brokerId', 'name panNumber address');
  
  return dematAccount;
};

/**
 * Delete a demat account
 * @param {String} accountId - Demat Account ID
 * @returns {Promise<void>}
 */
const deleteDematAccount = async (accountId) => {
  // Check if demat account exists
  const dematAccount = await DematAccount.findById(accountId);
  if (!dematAccount) {
    const error = new Error('Demat account not found');
    error.statusCode = 404;
    error.reasonCode = 'NOT_FOUND';
    throw error;
  }

  // Check for dependent transactions
  const transactionCount = await Transaction.countDocuments({ 
    dematAccountId: accountId 
  });
  
  if (transactionCount > 0) {
    const error = new Error('Cannot delete demat account with associated transactions');
    error.statusCode = 400;
    error.reasonCode = 'HAS_TRANSACTIONS';
    throw error;
  }

  // Check for dependent holdings
  const holdingsCount = await Holdings.countDocuments({ 
    dematAccountId: accountId 
  });
  
  if (holdingsCount > 0) {
    const error = new Error('Cannot delete demat account with associated holdings');
    error.statusCode = 400;
    error.reasonCode = 'HAS_HOLDINGS';
    throw error;
  }

  // Check for dependent ledger entries
  const ledgerCount = await LedgerEntry.countDocuments({ 
    dematAccountId: accountId 
  });
  
  if (ledgerCount > 0) {
    const error = new Error('Cannot delete demat account with associated ledger entries');
    error.statusCode = 400;
    error.reasonCode = 'HAS_LEDGER_ENTRIES';
    throw error;
  }

  // Check if any financial year reports contain this demat account
  const fyWithReport = await FinancialYear.findOne({
    [`reports.${accountId}`]: { $exists: true }
  });

  if (fyWithReport) {
    const error = new Error('Cannot delete demat account with associated financial year reports');
    error.statusCode = 400;
    error.reasonCode = 'HAS_FY_REPORTS';
    throw error;
  }

  // Delete demat account
  await DematAccount.findByIdAndDelete(accountId);
};

module.exports = {
  getDematAccounts,
  createDematAccount,
  updateDematAccount,
  deleteDematAccount
};
