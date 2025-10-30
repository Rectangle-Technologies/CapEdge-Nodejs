const Transaction = require('../models/Transaction');
const Security = require('../models/Security');
const DematAccount = require('../models/DematAccount');
const LedgerEntry = require('../models/LedgerEntry');
const FinancialYear = require('../models/FinancialYear');
const Holdings = require('../models/Holdings');
const { findOrCreateFinancialYear } = require('./financialYearService');
const mongoose = require('mongoose');

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
    const [buyTransaction, sellTransaction] = await Transaction.create([
        {
            ...baseTransaction,
            type: 'BUY',
            quantity: transactionData.quantity,
            price: transactionData.buyPrice
        },
        {
            ...baseTransaction,
            type: 'SELL',
            quantity: transactionData.quantity,
            price: transactionData.sellPrice
        }
    ], { session });

    await LedgerEntry.create([
        {
            dematAccountId: transactionData.dematAccountId,
            tradeTransactionId: buyTransaction._id,
            transactionAmount: -transactionData.buyPrice * transactionData.quantity,
            date: transactionDate
        },
        {
            dematAccountId: transactionData.dematAccountId,
            tradeTransactionId: sellTransaction._id,
            transactionAmount: transactionData.sellPrice * transactionData.quantity,
            date: transactionDate
        }
    ], { session });

    return [buyTransaction, sellTransaction];
};

const handleDeliveryTransaction = async (transactionData, baseTransaction, transactionDate, session) => {
    const [transaction] = await Transaction.create([{
        ...baseTransaction,
        type: transactionData.type,
        quantity: transactionData.quantity,
        price: transactionData.price
    }], { session });

    await LedgerEntry.create([{
        dematAccountId: transactionData.dematAccountId,
        tradeTransactionId: transaction._id,
        transactionAmount: (transactionData.type === 'BUY' ? -1 : 1) * transactionData.price * transactionData.quantity,
        date: transactionDate
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

const createTransactions = async (transactions) => {
    const session = await mongoose.startSession();
    const result = [];
    
    try {
        session.startTransaction({
            readConcern: { level: 'snapshot' },
            writeConcern: { w: 'majority' },
            readPreference: 'primary'
        });
        
        for (const txData of transactions) {
            const txResult = await createTransaction(txData, session);
            result.push(...txResult);
        }
        
        await session.commitTransaction();
        
        // Generate Reports (outside transaction or in separate transaction)

        return result;
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        await session.endSession();
    }
};

module.exports = {
    createTransactions
};
