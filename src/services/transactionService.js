const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const Security = require('../models/Security');
const DematAccount = require('../models/DematAccount');
const LedgerEntry = require('../models/LedgerEntry');
const UnmatchedRecords = require('../models/UnmatchedRecords');
const MatchedRecords = require('../models/MatchedRecords');

/**
 * Transaction Service
 * Handles all business logic for transaction management including FIFO matching
 */

/**
 * Get all transactions with optional filters and pagination
 * @param {Object} filters - { startDate, endDate, type, securityId, dematAccountId, deliveryType, limit, pageNo }
 * @returns {Promise<Object>} - { transactions, pagination }
 */
const getTransactions = async (filters = {}) => {
  const { startDate, endDate, type, securityId, dematAccountId, deliveryType, limit = 50, pageNo = 1 } = filters;
  
  // Build query
  const query = {};
  
  if (startDate || endDate) {
    query.date = {};
    if (startDate) query.date.$gte = new Date(startDate);
    if (endDate) query.date.$lte = new Date(endDate);
  }
  
  if (type) query.type = type;
  if (securityId) query.securityId = securityId;
  if (dematAccountId) query.dematAccountId = dematAccountId;
  if (deliveryType) query.deliveryType = deliveryType;

  // Calculate offset for pagination
  const offset = (pageNo - 1) * limit;

  // Get total count
  const total = await Transaction.countDocuments(query);

  // Fetch transactions with populated references
  const transactions = await Transaction.find(query)
    .populate({
      path: 'securityId',
      populate: {
        path: 'stockExchangeId',
        select: 'name code country'
      }
    })
    .populate({
      path: 'dematAccountId',
      populate: [
        { path: 'userAccountId', select: 'name panNumber' },
        { path: 'brokerId', select: 'name panNumber' }
      ]
    })
    .sort({ date: -1 })
    .limit(parseInt(limit))
    .skip(parseInt(offset))
    .lean();

  return {
    transactions,
    pagination: {
      total,
      count: transactions.length,
      limit: parseInt(limit),
      pageNo: parseInt(pageNo),
      totalPages: Math.ceil(total / limit)
    }
  };
};

/**
 * Create a new transaction with FIFO matching logic
 * @param {Object} transactionData - Transaction details
 * @returns {Promise<Object>} - Created transaction
 */
const createTransaction = async (transactionData) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { date, type, quantity, price, deliveryType, securityId, dematAccountId } = transactionData;

    // Validate security exists
    const security = await Security.findById(securityId).session(session);
    if (!security) {
      const error = new Error('Security not found');
      error.statusCode = 404;
      throw error;
    }

    // Validate demat account exists
    const dematAccount = await DematAccount.findById(dematAccountId).session(session);
    if (!dematAccount) {
      const error = new Error('Demat account not found');
      error.statusCode = 404;
      throw error;
    }

    // Validate date is not in future
    if (new Date(date) > new Date()) {
      const error = new Error('Transaction date cannot be in the future');
      error.statusCode = 400;
      throw error;
    }

    // Calculate transaction value
    const transactionValue = quantity * price;

    // Create transaction
    const transaction = new Transaction({
      date,
      type,
      quantity,
      price,
      deliveryType,
      securityId,
      dematAccountId
    });

    await transaction.save({ session });

    // Create ledger entry
    const ledgerAmount = type === 'BUY' ? -transactionValue : transactionValue;
    const ledgerEntry = new LedgerEntry({
      dematAccountId,
      tradeTransactionId: transaction._id,
      amount: ledgerAmount,
      date
    });
    await ledgerEntry.save({ session });

    // Update demat account balance
    await DematAccount.findByIdAndUpdate(
      dematAccountId,
      { $inc: { balance: ledgerAmount } },
      { session }
    );

    // Handle delivery transactions
    if (deliveryType === 'Delivery') {
      if (type === 'BUY') {
        // Create unmatched record (holding)
        const unmatchedRecord = new UnmatchedRecords({
          buyDate: date,
          quantity,
          buyPrice: price,
          securityId,
          dematAccountId,
          buyTransactionId: transaction._id
        });
        await unmatchedRecord.save({ session });
      } else if (type === 'SELL') {
        // Implement FIFO matching
        await matchTransactionsFIFO(transaction, session);
      }
    }

    await session.commitTransaction();
    
    // Populate transaction for response
    await transaction.populate([
      {
        path: 'securityId',
        populate: { path: 'stockExchangeId', select: 'name code country' }
      },
      {
        path: 'dematAccountId',
        populate: [
          { path: 'userAccountId', select: 'name panNumber' },
          { path: 'brokerId', select: 'name panNumber' }
        ]
      }
    ]);

    return transaction;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

/**
 * FIFO Matching Algorithm for SELL transactions
 * @param {Object} sellTransaction - The sell transaction to match
 * @param {Object} session - Mongoose session for transaction
 */
const matchTransactionsFIFO = async (sellTransaction, session) => {
  const { quantity, price, date, securityId, dematAccountId } = sellTransaction;
  
  let remainingQuantity = quantity;

  // Fetch unmatched records for this security (FIFO order - oldest first)
  const unmatchedRecords = await UnmatchedRecords.find({
    securityId,
    dematAccountId
  })
    .sort({ buyDate: 1 }) // FIFO - oldest first
    .session(session);

  // Check if sufficient holdings exist
  const totalHoldings = unmatchedRecords.reduce((sum, record) => sum + record.quantity, 0);
  if (totalHoldings < quantity) {
    const error = new Error('Insufficient holdings for this security');
    error.statusCode = 400;
    throw error;
  }

  // Match with unmatched records
  for (const unmatchedRecord of unmatchedRecords) {
    if (remainingQuantity === 0) break;

    const matchedQuantity = Math.min(remainingQuantity, unmatchedRecord.quantity);
    
    // Calculate holding period and capital gain type
    const buyDate = new Date(unmatchedRecord.buyDate);
    const sellDate = new Date(date);
    const holdingDays = Math.floor((sellDate - buyDate) / (1000 * 60 * 60 * 24));
    
    // Determine capital gain type based on security type
    const security = await Security.findById(securityId).session(session);
    let capitalGainType;
    
    if (security.type === 'EQUITY') {
      capitalGainType = holdingDays >= 365 ? 'LTCG' : 'STCG';
    } else {
      // Non-equity (Debt, Mutual Funds, etc.)
      capitalGainType = holdingDays >= 1095 ? 'LTCG' : 'STCG'; // 3 years
    }

    // Calculate P&L
    const profitLoss = (price - unmatchedRecord.buyPrice) * matchedQuantity;

    // Create matched record
    const matchedRecord = new MatchedRecords({
      buyDate: unmatchedRecord.buyDate,
      sellDate: date,
      quantity: matchedQuantity,
      buyPrice: unmatchedRecord.buyPrice,
      sellPrice: price,
      profitLoss,
      capitalGainType,
      securityId,
      dematAccountId,
      buyTransactionId: unmatchedRecord.buyTransactionId,
      sellTransactionId: sellTransaction._id
    });
    await matchedRecord.save({ session });

    // Update or delete unmatched record
    if (matchedQuantity === unmatchedRecord.quantity) {
      // Fully matched - delete unmatched record
      await UnmatchedRecords.findByIdAndDelete(unmatchedRecord._id, { session });
    } else {
      // Partially matched - update quantity
      unmatchedRecord.quantity -= matchedQuantity;
      await unmatchedRecord.save({ session });
    }

    remainingQuantity -= matchedQuantity;
  }
};

/**
 * Update an existing transaction
 * @param {String} transactionId - Transaction ID
 * @param {Object} updateData - Updated transaction data
 * @returns {Promise<Object>} - Updated transaction
 */
const updateTransaction = async (transactionId, updateData) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Check if transaction exists
    const transaction = await Transaction.findById(transactionId).session(session);
    if (!transaction) {
      const error = new Error('Transaction not found');
      error.statusCode = 404;
      throw error;
    }

    // Check if transaction is part of matched records
    const matchedCount = await MatchedRecords.countDocuments({
      $or: [
        { buyTransactionId: transactionId },
        { sellTransactionId: transactionId }
      ]
    }).session(session);

    if (matchedCount > 0) {
      const error = new Error('Cannot update transaction that is part of matched records');
      error.statusCode = 400;
      throw error;
    }

    // Store old values for balance recalculation
    const oldValue = transaction.quantity * transaction.price;
    const oldType = transaction.type;

    // Update transaction fields
    Object.assign(transaction, updateData);
    await transaction.save({ session });

    // Recalculate ledger entry
    const newValue = transaction.quantity * transaction.price;
    const newAmount = transaction.type === 'BUY' ? -newValue : newValue;
    
    await LedgerEntry.findOneAndUpdate(
      { tradeTransactionId: transactionId },
      { amount: newAmount, date: transaction.date },
      { session }
    );

    // Recalculate demat account balance
    const oldAmount = oldType === 'BUY' ? -oldValue : oldValue;
    const balanceAdjustment = newAmount - oldAmount;
    
    await DematAccount.findByIdAndUpdate(
      transaction.dematAccountId,
      { $inc: { balance: balanceAdjustment } },
      { session }
    );

    // Update unmatched records if applicable
    if (transaction.deliveryType === 'Delivery' && transaction.type === 'BUY') {
      await UnmatchedRecords.findOneAndUpdate(
        { buyTransactionId: transactionId },
        {
          buyDate: transaction.date,
          quantity: transaction.quantity,
          buyPrice: transaction.price
        },
        { session }
      );
    }

    await session.commitTransaction();
    
    await transaction.populate([
      {
        path: 'securityId',
        populate: { path: 'stockExchangeId', select: 'name code country' }
      },
      {
        path: 'dematAccountId',
        populate: [
          { path: 'userAccountId', select: 'name panNumber' },
          { path: 'brokerId', select: 'name panNumber' }
        ]
      }
    ]);

    return transaction;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

/**
 * Delete a transaction
 * @param {String} transactionId - Transaction ID
 * @returns {Promise<void>}
 */
const deleteTransaction = async (transactionId) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Check if transaction exists
    const transaction = await Transaction.findById(transactionId).session(session);
    if (!transaction) {
      const error = new Error('Transaction not found');
      error.statusCode = 404;
      throw error;
    }

    // Check if transaction is part of matched records
    const matchedCount = await MatchedRecords.countDocuments({
      $or: [
        { buyTransactionId: transactionId },
        { sellTransactionId: transactionId }
      ]
    }).session(session);

    if (matchedCount > 0) {
      const error = new Error('Cannot delete transaction that is part of matched records');
      error.statusCode = 400;
      throw error;
    }

    // Delete ledger entry
    await LedgerEntry.findOneAndDelete(
      { tradeTransactionId: transactionId },
      { session }
    );

    // Recalculate demat account balance
    const transactionValue = transaction.quantity * transaction.price;
    const balanceAdjustment = transaction.type === 'BUY' ? transactionValue : -transactionValue;
    
    await DematAccount.findByIdAndUpdate(
      transaction.dematAccountId,
      { $inc: { balance: balanceAdjustment } },
      { session }
    );

    // Delete unmatched record if applicable
    if (transaction.deliveryType === 'Delivery' && transaction.type === 'BUY') {
      await UnmatchedRecords.findOneAndDelete(
        { buyTransactionId: transactionId },
        { session }
      );
    }

    // Delete transaction
    await Transaction.findByIdAndDelete(transactionId, { session });

    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

module.exports = {
  getTransactions,
  createTransaction,
  updateTransaction,
  deleteTransaction
};
