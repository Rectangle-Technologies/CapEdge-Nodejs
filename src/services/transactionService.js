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

const createTransaction = async (transactionData, session) => {
    const dematAccount = await DematAccount.findById(transactionData.dematAccountId).session(session);
    if (!dematAccount) {
        const error = new Error('Demat account not found');
        error.statusCode = 404;
        error.reasonCode = 'NOT_FOUND';
        throw error;
    }

    const security = await Security.findById(transactionData.securityId).session(session);
    if (!security) {
        const error = new Error('Security not found');
        error.statusCode = 404;
        error.reasonCode = 'NOT_FOUND';
        throw error;
    }

    const transactionDate = new Date(transactionData.date);
    const financialYear = await findOrCreateFinancialYear(transactionDate, session);

    const result = [];

    // Check delivery type
    if (transactionData.deliveryType === 'Intraday') {
        // Add two transaction entries: BUY and SELL
        // For simplicity, assuming quantity is positive for BUY and negative for SELL
        const buyTransaction = await Transaction.create([{
            date: transactionDate,
            type: 'BUY',
            quantity: transactionData.quantity,
            price: transactionData.buyPrice,
            securityId: transactionData.securityId,
            deliveryType: 'Intraday',
            dematAccountId: transactionData.dematAccountId,
            referenceNumber: transactionData.referenceNumber || '',
            financialYearId: financialYear._id
        }], { session });

        const sellTransaction = await Transaction.create([{
            date: transactionDate,
            type: 'SELL',
            quantity: transactionData.quantity,
            price: transactionData.sellPrice,
            securityId: transactionData.securityId,
            deliveryType: 'Intraday',
            dematAccountId: transactionData.dematAccountId,
            referenceNumber: transactionData.referenceNumber || '',
            financialYearId: financialYear._id
        }], { session });

        // TODO: Ledger entries update for intraday can be added here
        await LedgerEntry.create([{
            dematAccountId: transactionData.dematAccountId,
            tradeTransactionId: buyTransaction[0]._id,
            transactionAmount: -transactionData.buyPrice * transactionData.quantity,
            date: transactionDate
        }, {
            dematAccountId: transactionData.dematAccountId,
            tradeTransactionId: sellTransaction[0]._id,
            transactionAmount: transactionData.sellPrice * transactionData.quantity,
            date: transactionDate
        }], { session });

        result.push(buyTransaction[0], sellTransaction[0]);

    } else if (transactionData.deliveryType === 'Delivery') {
        // Create main transaction record
        const transaction = await Transaction.create([{
            date: transactionDate,
            type: transactionData.type,
            quantity: transactionData.quantity,
            price: transactionData.price,
            securityId: transactionData.securityId,
            deliveryType: 'Delivery',
            dematAccountId: transactionData.dematAccountId,
            referenceNumber: transactionData.referenceNumber || '',
            financialYearId: financialYear._id
        }], { session });

        // Add entry in ledger
        await LedgerEntry.create([{
            dematAccountId: transactionData.dematAccountId,
            tradeTransactionId: transaction[0]._id,
            transactionAmount: (transactionData.type === 'BUY' ? -1 : 1) * transactionData.price * transactionData.quantity,
            date: transactionDate
        }], { session });

        result.push(transaction[0]);
    }

    return result;
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
        session.endSession();
    }
};

module.exports = {
    createTransactions
};
