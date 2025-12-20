const Transaction = require('../models/Transaction');
const Security = require('../models/Security');
const DematAccount = require('../models/DematAccount');
const LedgerEntry = require('../models/LedgerEntry');
const FinancialYear = require('../models/FinancialYear');
const Holdings = require('../models/Holdings');
const { findOrCreateFinancialYear } = require('./financialYearService');
const mongoose = require('mongoose');
const { updateRecords } = require('./recordService');
const logger = require("../utils/logger");
const { created } = require('../utils/response');

const getTransactions = async (filters = {}) => {
    const { startDate, endDate, type, securityId, dematAccountId, limit, pageNo = 1, financialYearId } = filters;
    const query = {};
    if (startDate || endDate) {
        query.date = {};
        if (startDate) {
            query.date.$gte = new Date(startDate);
        }
        if (endDate) {
            query.date.$lte = new Date(endDate);
        }
    }
    if (type) {
        query.type = type;
    }
    if (securityId) {
        query.securityId = securityId;
    }
    if (dematAccountId) {
        query.dematAccountId = dematAccountId;
    }
    if (financialYearId) {
        query.financialYearId = financialYearId;
    }
    const options = {
        sort: { date: 1, createdAt: 1 },
        skip: limit ? (pageNo - 1) * limit : 0,
        limit: limit ? parseInt(limit) : 0
    };
    const total = await Transaction.countDocuments(query);
    const transactions = await Transaction.find(query, null, options)
        .populate('securityId')
        .populate({
            path: 'dematAccountId',
            populate: {
                path: 'brokerId'
            }
        })
        .lean();
    return {
        transactions,
        pagination: {
            total,
            count: transactions.length,
            limit: limit ? parseInt(limit) : total,
            pageNo: parseInt(pageNo)
        }
    };
};

/**
 * Create a new transaction following the specified flow
 * Flow:
 * 1. Fetch dematAccount and validate user
 * 2. Check if FY exists in DB for the transaction date
 * 3. If not, store snapshots and create new FY with STCG/LTCG rates
 * 4. Create new transaction entry
 * 5. For BUY: Insert new holding record
 *    For SELL: Match with existing holdings and create ledger entries
 * 6. Update FY transactions and balances
 * 
 * @param {Object} transactionData - Transaction details
 * @param {Date} transactionData.date - Transaction date
 * @param {String} transactionData.type - 'BUY' or 'SELL'
 * @param {Number} transactionData.quantity - Quantity
 * @param {Number} transactionData.price - Price per unit
 * @param {String} transactionData.securityId - Security ID
 * @param {String} transactionData.deliveryType - 'Delivery' or 'Intraday'
 * @param {String} transactionData.dematAccountId - Demat account ID
 * @param {String} transactionData.referenceNumber - Optional reference number
 * @returns {Promise<Object>} - Created transaction with related records
 */

const throwNotFoundError = (message) => {
    const error = new Error(message);
    error.statusCode = 404;
    error.reasonCode = 'NOT_FOUND';
    throw error;
};

const validateTransaction = async (transactionData, session) => {
    const [dematAccount, security] = await Promise.all([
        DematAccount.findById(transactionData.dematAccountId).session(session),
        Security.findById(transactionData.securityId).session(session)
    ]);

    if (!dematAccount) throwNotFoundError('Demat account not found');
    if (!security) throwNotFoundError('Security not found');
};

const handleIntradayTransaction = async (transactionData, baseTransaction, transactionDate, session) => {
    const [buyTransaction] = await Transaction.create([{
        ...baseTransaction,
        type: 'BUY',
        quantity: transactionData.quantity,
        price: transactionData.buyPrice,
        transactionCost: transactionData.transactionCost / 2 || 0
    }], { session });

    const [sellTransaction] = await Transaction.create([{
        ...baseTransaction,
        type: 'SELL',
        quantity: transactionData.quantity,
        price: transactionData.sellPrice,
        buyTransactionId: buyTransaction._id,
        transactionCost: transactionData.transactionCost / 2 || 0  
    }], { session });

    await LedgerEntry.create([
        {
            dematAccountId: transactionData.dematAccountId,
            tradeTransactionId: buyTransaction._id,
            transactionAmount: -transactionData.buyPrice * transactionData.quantity,
            date: transactionDate,
            remarks: 'Intraday BUY, contract reference: ' + (transactionData.referenceNumber || '')
        },
        {
            dematAccountId: transactionData.dematAccountId,
            tradeTransactionId: sellTransaction._id,
            transactionAmount: transactionData.sellPrice * transactionData.quantity,
            date: transactionDate,
            remarks: 'Intraday SELL, contract reference: ' + (transactionData.referenceNumber || '')
        }
    ], { session });

    return [buyTransaction, sellTransaction];
};

const handleDeliveryTransaction = async (transactionData, baseTransaction, transactionDate, session) => {
    const [transaction] = await Transaction.create([{
        ...baseTransaction,
        type: transactionData.type,
        quantity: transactionData.quantity,
        price: transactionData.price,
        transactionCost: transactionData.transactionCost || 0
    }], { session });

    if (transactionData.isIpo) {
        return [transaction];
    }

    await LedgerEntry.create([{
        dematAccountId: transactionData.dematAccountId,
        tradeTransactionId: transaction._id,
        transactionAmount: (transactionData.type === 'BUY' ? -1 : 1) * transactionData.price * transactionData.quantity,
        date: transactionDate,
        remarks: transactionData.type + ' transaction, contract reference: ' + (transactionData.referenceNumber || '')
    }], { session });

    return [transaction];
};

const createTransaction = async (transactionData, session) => {
    await validateTransaction(transactionData, session);

    const transactionDate = new Date(transactionData.date);
    const financialYear = await findOrCreateFinancialYear(transactionDate, session);

    const baseTransaction = {
        date: transactionDate,
        securityId: transactionData.securityId,
        deliveryType: transactionData.deliveryType,
        dematAccountId: transactionData.dematAccountId,
        referenceNumber: transactionData.referenceNumber || '',
        financialYearId: financialYear._id
    };

    return transactionData.deliveryType === 'Intraday'
        ? await handleIntradayTransaction(transactionData, baseTransaction, transactionDate, session)
        : await handleDeliveryTransaction(transactionData, baseTransaction, transactionDate, session);
};

/**
 * Execute transaction with retry logic for transient errors
 * This handles MongoDB's TransientTransactionError which occurs when:
 * - A transaction fails due to business logic and corrupts the session
 * - Network issues or temporary MongoDB unavailability
 * - Lock timeouts or write conflicts
 */
const executeTransactionWithRetry = async (transactionLogic, maxRetries = 3) => {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        // Create a NEW session for each attempt to avoid session corruption
        const session = await mongoose.startSession();
        
        try {
            session.startTransaction({
                readConcern: { level: 'snapshot' },
                writeConcern: { w: 'majority' },
                readPreference: 'primary'
            });
            // Execute the transaction logic
            const result = await transactionLogic(session);

            // Commit the transaction
            await session.commitTransaction();
            return result;
        } catch (error) {
            console.error(`Error in transaction attempt ${attempt}:`, error);
            
            // Abort the transaction if it's still active
            if (session.inTransaction()) {
                console.error('Aborting transaction due to error.');
                await session.abortTransaction();
            }
            
            lastError = error;
            
            // Check if this is a transient error that we should retry
            const isTransientError = error.hasErrorLabel && error.hasErrorLabel('TransientTransactionError');
            const isSessionCorruption = error.message && (
                error.message.includes('Transaction numbers are only allowed') ||
                error.message.includes('Given transaction number')
            );
            
            // Don't retry business logic errors (like "Not enough holdings")
            const isBusinessLogicError = error.statusCode === 405 || error.reasonCode === 'NOT_ALLOWED' ||
                                        error.statusCode === 404 || error.reasonCode === 'NOT_FOUND';
            
            if (isBusinessLogicError) {
                console.log('Business logic error detected, not retrying.');
                throw error;
            }
            
            // Retry on transient errors or session corruption
            if ((isTransientError || isSessionCorruption) && attempt < maxRetries) {
                console.log(`Transient error detected, retrying with fresh session...`);
                // Wait a bit before retrying (exponential backoff)
                await new Promise(resolve => setTimeout(resolve, 100 * attempt));
                continue;
            }
            
            // If we've exhausted retries or it's not a transient error, throw
            throw error;
            
        } finally {
            // Always end the session to free resources
            console.log('Ending session.');
            await session.endSession();
        }
    }
    
    // If we get here, all retries failed
    throw lastError;
};

const createTransactions = async (transactions) => {
    // Execute with retry logic
    return await executeTransactionWithRetry(async (session) => {
        const result = [];
        
        for (const txData of transactions) {
            const txResult = await createTransaction(txData, session);
            result.push(...txResult);
        }

        const totalTransactionCost = result.reduce((sum, tx) => sum + (tx.transactionCost || 0), 0);
        const remarks = `Charges for ${transactions[0]?.referenceNumber || 'transaction'}`;
        if (totalTransactionCost > 0) {
            await LedgerEntry.create([{
                dematAccountId: result[0].dematAccountId,
                transactionAmount: -totalTransactionCost,
                remarks: remarks,
                date: result[0].date
            }], { session });
        }

        await updateRecords(result[0].date, result[0].dematAccountId, session);
        return result;
    });
};

const deleteTransaction = async (transactionId) => {
    // Execute with retry logic
    return await executeTransactionWithRetry(async (session) => {
        const transaction = await Transaction.findById(transactionId).session(session);
        if (!transaction) {
            const error = new Error('Transaction not found');
            error.statusCode = 404;
            error.reasonCode = 'NOT_FOUND';
            throw error;
        }

        if (transaction.deliveryType === 'Intraday') {
            // For Intraday transactions, only allow deletion through the BUY transaction
            if (transaction.type === 'SELL') {
                const error = new Error('Cannot delete SELL intraday transaction directly. Delete the corresponding BUY transaction instead.');
                error.statusCode = 405;
                error.reasonCode = 'NOT_ALLOWED';
                throw error;
            }

            // Find and delete the corresponding SELL transaction
            const sellTransaction = await Transaction.findOne({
                buyTransactionId: transaction._id
            }).session(session);

            if (sellTransaction) {
                // Delete both transactions
                await Transaction.deleteMany({
                    _id: { $in: [transaction._id, sellTransaction._id] }
                }).session(session);
                
                // Delete corresponding ledger entries
                await LedgerEntry.deleteMany({
                    tradeTransactionId: { $in: [transaction._id, sellTransaction._id] }
                }).session(session);
            }
        } else {
            // For Delivery type, just delete the single transaction
            await Transaction.deleteOne({ _id: transactionId }).session(session);
            
            await LedgerEntry.deleteMany({
                tradeTransactionId: transaction._id
            }).session(session);
        }

        // Update records after deletion
        
        await updateRecords(transaction.date, transaction.dematAccountId, session);
    });
}

module.exports = {
    createTransactions,
    getTransactions,
    deleteTransaction
};
