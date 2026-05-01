const Transaction = require('../models/Transaction');
const Security = require('../models/Security');
const DematAccount = require('../models/DematAccount');
const LedgerEntry = require('../models/LedgerEntry');
const FinancialYear = require('../models/FinancialYear');
const Holdings = require('../models/Holdings');
const { findOrCreateFinancialYear } = require('./financialYearService');
const mongoose = require('mongoose');
const { updateRecords } = require('./recordService');
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

    // Check if there is a split entry after the transaction date
    console.log('Security Split History:', security.splitHistory);
    console.log('Transaction Date:', transactionData);
    const splitEntry = security.splitHistory.find(split => new Date(split.splitDate) > new Date(transactionData.date));
    if (splitEntry) {
        const splitDate = new Date(splitEntry.splitDate);
        const formattedDate = `${splitDate.getDate().toString().padStart(2, '0')}/${(splitDate.getMonth() + 1).toString().padStart(2, '0')}/${splitDate.getFullYear()}`;
        const error = new Error(`Cannot add transaction for ${security.name} as it was split on ${formattedDate}`);
        error.statusCode = 400;
        error.reasonCode = 'BAD_REQUEST';
        throw error;
    }

    if (!dematAccount) throwNotFoundError('Demat account not found');
    if (!security) throwNotFoundError('Security not found');
};

const handleIntradayTransaction = async (transactionData, baseTransaction, session) => {
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

    return [buyTransaction, sellTransaction];
};

const handleDeliveryTransaction = async (transactionData, baseTransaction, session) => {
    const [transaction] = await Transaction.create([{
        ...baseTransaction,
        type: transactionData.type,
        quantity: transactionData.quantity,
        price: transactionData.price,
        transactionCost: transactionData.transactionCost || 0,
        isIpo: transactionData.isIpo || false
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
        ? await handleIntradayTransaction(transactionData, baseTransaction, session)
        : await handleDeliveryTransaction(transactionData, baseTransaction, session);
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

        // Bundle every non-IPO trade in this submission into a single ledger entry.
        // transactionAmount = sum(signed trade amounts) - sum(transactionCost), so
        // charges roll into the same row in the ledger view.
        const ledgerTxs = result.filter(tx => !tx.isIpo);
        if (ledgerTxs.length > 0) {
            const bundleAmount = ledgerTxs.reduce((sum, tx) => {
                const signed = (tx.type === 'BUY' ? -1 : 1) * tx.quantity * tx.price;
                return sum + signed - (tx.transactionCost || 0);
            }, 0);
            const refNumber = transactions[0]?.referenceNumber || 'transaction';
            const tradeWord = ledgerTxs.length === 1 ? 'trade' : 'trades';
            const remarks = `Trades for ref: ${refNumber} (${ledgerTxs.length} ${tradeWord})`;

            await LedgerEntry.create([{
                dematAccountId: ledgerTxs[0].dematAccountId,
                tradeTransactionIds: ledgerTxs.map(t => t._id),
                transactionAmount: bundleAmount,
                remarks,
                date: ledgerTxs[0].date
            }], { session });
        }

        await updateRecords(result[0].date, result[0].dematAccountId, session);
        return result;
    });
};

const _deleteTransactionLogic = async (transactionId, session) => {
    const transaction = await Transaction.findById(transactionId).session(session);
    if (!transaction) {
        const error = new Error('Transaction not found');
        error.statusCode = 404;
        error.reasonCode = 'NOT_FOUND';
        throw error;
    }

    // Resolve which transactions get removed in this call. Intraday SELL is
    // not deletable directly; deleting the BUY removes its paired SELL too.
    let txsToDelete;
    if (transaction.deliveryType === 'Intraday') {
        if (transaction.type === 'SELL') {
            const error = new Error('Cannot delete SELL intraday transaction directly. Delete the corresponding BUY transaction instead.');
            error.statusCode = 405;
            error.reasonCode = 'NOT_ALLOWED';
            throw error;
        }
        const sellTransaction = await Transaction.findOne({ buyTransactionId: transaction._id }).session(session);
        txsToDelete = sellTransaction ? [transaction, sellTransaction] : [transaction];
    } else {
        txsToDelete = [transaction];
    }

    const txIdsToDelete = txsToDelete.map(t => t._id);

    // Find every bundled ledger entry that references any of these txs and
    // either unlink the txs (recomputing transactionAmount) or delete the
    // whole bundle when its tradeTransactionIds becomes empty.
    const bundles = await LedgerEntry.find({
        tradeTransactionIds: { $in: txIdsToDelete }
    }).session(session);

    for (const bundle of bundles) {
        const txsInThisBundle = txsToDelete.filter(t =>
            bundle.tradeTransactionIds.some(id => id.equals(t._id))
        );
        const delta = txsInThisBundle.reduce((sum, t) => {
            const signed = (t.type === 'BUY' ? -1 : 1) * t.quantity * t.price;
            return sum + signed - (t.transactionCost || 0);
        }, 0);
        const remainingIds = bundle.tradeTransactionIds.filter(id =>
            !txsInThisBundle.some(t => t._id.equals(id))
        );

        if (remainingIds.length === 0) {
            await LedgerEntry.deleteOne({ _id: bundle._id }).session(session);
        } else {
            bundle.tradeTransactionIds = remainingIds;
            bundle.transactionAmount = bundle.transactionAmount - delta;
            const refNumber = txsInThisBundle[0]?.referenceNumber || 'transaction';
            const tradeWord = remainingIds.length === 1 ? 'trade' : 'trades';
            bundle.remarks = `Trades for ref: ${refNumber} (${remainingIds.length} ${tradeWord})`;
            await bundle.save({ session });
        }
    }

    await Transaction.deleteMany({ _id: { $in: txIdsToDelete } }).session(session);

    await updateRecords(transaction.date, transaction.dematAccountId, session);
};

const deleteTransaction = async (transactionId) => {
    return await executeTransactionWithRetry(async (session) => {
        await _deleteTransactionLogic(transactionId, session);
    });
};

const editTransaction = async (transactionId, newTransactionData) => {
    return await executeTransactionWithRetry(async (session) => {
        // Step 1: Delete the old transaction record(s), unlink its ledger entry,
        // and recalculate holdings/balances from the old date.
        await _deleteTransactionLogic(transactionId, session);

        // Step 2: Create the new transaction record(s) with the updated data.
        const newTxs = await createTransaction(newTransactionData, session);

        // Step 3: Create a bundled ledger entry for non-IPO trades (mirrors
        // the logic in createTransactions).
        const ledgerTxs = newTxs.filter(tx => !tx.isIpo);
        if (ledgerTxs.length > 0) {
            const bundleAmount = ledgerTxs.reduce((sum, tx) => {
                const signed = (tx.type === 'BUY' ? -1 : 1) * tx.quantity * tx.price;
                return sum + signed - (tx.transactionCost || 0);
            }, 0);
            const refNumber = newTransactionData.referenceNumber || 'transaction';
            const tradeWord = ledgerTxs.length === 1 ? 'trade' : 'trades';
            const remarks = `Trades for ref: ${refNumber} (${ledgerTxs.length} ${tradeWord})`;
            await LedgerEntry.create([{
                dematAccountId: ledgerTxs[0].dematAccountId,
                tradeTransactionIds: ledgerTxs.map(t => t._id),
                transactionAmount: bundleAmount,
                remarks,
                date: ledgerTxs[0].date
            }], { session });
        }

        // Step 4: Recalculate holdings and balances from the new transaction date.
        await updateRecords(newTxs[0].date, newTxs[0].dematAccountId, session);
        return newTxs;
    });
};

const getContracts = async (filters = {}) => {
    const { dematAccountId, securityId, financialYearId, referenceNumber, date, limit = 50, pageNo = 1 } = filters;

    const baseMatch = {
        isIpo: { $ne: true },
        referenceNumber: { $exists: true, $nin: [null, ''] }
    };
    if (financialYearId) baseMatch.financialYearId = new mongoose.Types.ObjectId(financialYearId);
    if (dematAccountId) baseMatch.dematAccountId = new mongoose.Types.ObjectId(dematAccountId);
    if (referenceNumber) baseMatch.referenceNumber = { $regex: referenceNumber, $options: 'i' };
    if (date) {
        const start = new Date(date);
        start.setHours(0, 0, 0, 0);
        const end = new Date(date);
        end.setHours(23, 59, 59, 999);
        baseMatch.date = { $gte: start, $lte: end };
    }

    // Stage 1: find candidate referenceNumbers, optionally filtered by securityId,
    // grouped per (referenceNumber, dematAccountId) so a ref reused across demat
    // accounts stays separated.
    const candidateMatch = { ...baseMatch };
    if (securityId) candidateMatch.securityId = new mongoose.Types.ObjectId(securityId);

    const parsedLimit = parseInt(limit, 10) || 50;
    const parsedPage = Math.max(1, parseInt(pageNo, 10) || 1);
    const skip = (parsedPage - 1) * parsedLimit;

    const facet = await Transaction.aggregate([
        { $match: candidateMatch },
        {
            $group: {
                _id: { referenceNumber: '$referenceNumber', dematAccountId: '$dematAccountId' },
                latestDate: { $max: '$date' }
            }
        },
        {
            $facet: {
                page: [
                    { $sort: { latestDate: 1, '_id.referenceNumber': 1 } },
                    { $skip: skip },
                    { $limit: parsedLimit }
                ],
                totalCount: [{ $count: 'total' }]
            }
        }
    ]);

    const pageGroups = facet[0]?.page || [];
    const total = facet[0]?.totalCount?.[0]?.total || 0;

    if (pageGroups.length === 0) {
        return {
            contracts: [],
            pagination: { total, count: 0, limit: parsedLimit, pageNo: parsedPage }
        };
    }

    // Stage 2: re-fetch every trade for the paginated (refNumber, dematAccount)
    // pairs without the securityId filter, so contracts surface their full trade
    // list even when a security filter narrowed the candidate scan.
    const refNumbers = [...new Set(pageGroups.map((g) => g._id.referenceNumber))];
    const dematIds = [...new Set(pageGroups.map((g) => String(g._id.dematAccountId)))];

    const tradesMatch = { ...baseMatch };
    tradesMatch.referenceNumber = { $in: refNumbers };
    tradesMatch.dematAccountId = { $in: dematIds.map((id) => new mongoose.Types.ObjectId(id)) };

    const trades = await Transaction.find(tradesMatch)
        .sort({ date: 1, createdAt: 1 })
        .populate('securityId')
        .populate({ path: 'dematAccountId', populate: { path: 'brokerId' } })
        .lean();

    // Group trades back into contracts keyed by (referenceNumber, dematAccountId)
    const contractsMap = new Map();
    for (const trade of trades) {
        const key = `${trade.referenceNumber}::${trade.dematAccountId?._id || trade.dematAccountId}`;
        if (!contractsMap.has(key)) {
            contractsMap.set(key, {
                referenceNumber: trade.referenceNumber,
                dematAccountId: trade.dematAccountId,
                trades: [],
                netBuyAmount: 0,
                netSellAmount: 0,
                totalCost: 0,
                securityIds: new Set()
            });
        }
        const contract = contractsMap.get(key);
        contract.trades.push(trade);

        const amount = (trade.quantity || 0) * (trade.price || 0);
        const cost = trade.transactionCost || 0;
        if (trade.type === 'BUY') {
            contract.netBuyAmount += amount;
        } else if (trade.type === 'SELL') {
            contract.netSellAmount += amount;
        }
        contract.totalCost += cost;
        if (trade.securityId?._id) contract.securityIds.add(String(trade.securityId._id));
    }

    // Order the response to match the paginated facet ordering.
    const contracts = pageGroups
        .map((g) => {
            const key = `${g._id.referenceNumber}::${g._id.dematAccountId}`;
            const contract = contractsMap.get(key);
            if (!contract) return null;
            const dates = contract.trades.map((t) => t.date).filter(Boolean);
            const latestDate = dates.length ? new Date(Math.max(...dates.map((d) => new Date(d).getTime()))) : null;
            return {
                referenceNumber: contract.referenceNumber,
                date: latestDate,
                dematAccountId: contract.dematAccountId,
                totalTrades: contract.trades.length,
                securityCount: contract.securityIds.size,
                netBuyAmount: contract.netBuyAmount,
                netSellAmount: contract.netSellAmount,
                totalCost: contract.totalCost,
                trades: contract.trades
            };
        })
        .filter(Boolean);

    return {
        contracts,
        pagination: {
            total,
            count: contracts.length,
            limit: parsedLimit,
            pageNo: parsedPage
        }
    };
};

module.exports = {
    createTransactions,
    getTransactions,
    getContracts,
    deleteTransaction,
    editTransaction
};
