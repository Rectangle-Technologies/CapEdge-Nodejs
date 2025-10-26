const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const Security = require('../models/Security');
const DematAccount = require('../models/DematAccount');
const LedgerEntry = require('../models/LedgerEntry');
const FinancialYear = require('../models/FinancialYear');
const Holdings = require('../models/Holdings');
const { findOrCreateFinancialYear } = require('./financialYearService');

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
    

    console.log('Creating transaction:', transactionData);

    const dematAccount = await DematAccount.findById(transactionData.dematAccountId).session(session);
    if (!dematAccount) {
        throw new Error('Demat account not found');
    }

    const security = await Security.findById(transactionData.securityId).session(session);
    if (!security) {
        throw new Error('Security not found');
    }

    const transactionDate = new Date(transactionData.date);
    const financialYear = await findOrCreateFinancialYear(transactionDate, dematAccount._id, session);

    console.log('Using Financial Year:', financialYear);

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
            referenceNumber: transactionData.referenceNumber || ''
        }], { session });

        const sellTransaction = await Transaction.create([{
            date: transactionDate,
            type: 'SELL',
            quantity: transactionData.quantity,
            price: transactionData.sellPrice,
            securityId: transactionData.securityId,
            deliveryType: 'Intraday',
            dematAccountId: transactionData.dematAccountId,
            referenceNumber: transactionData.referenceNumber || ''
        }], { session });

        // TODO: Ledger entries update for intraday can be added here
        await buyTransaction[0].save({ session });
        await sellTransaction[0].save({ session });

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
            referenceNumber: transactionData.referenceNumber || ''
        }], { session });
        await transaction[0].save({ session });
    }
};

const createTransactions = async (transactions) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    for (const txData of transactions) {
        await createTransaction(txData, session);
    }

    await session.commitTransaction();
    session.endSession();

    // Generate Reports 
}

/**
 * Match holdings for SELL transaction using FIFO method
 * @private
 */
const matchAndSellHoldings = async (
    dematAccountId,
    securityId,
    quantity,
    price,
    symbol,
    transactionId,
    transactionDate,
    financialYearId,
    session
) => {
    let remainingQty = quantity;
    const matchedHoldings = [];
    const ledgerEntries = [];

    // Get holdings in FIFO order (oldest first)
    const availableHoldings = await Holdings.find({
        dematAccountId: dematAccountId,
        securityId: securityId,
        quantity: { $gt: 0 } // Only positive quantities
    })
        .sort({ buyDate: 1 })
        .session(session);

    if (availableHoldings.length === 0) {
        throw new Error(`No available holdings for ${symbol} in this demat account`);
    }

    let totalCostPrice = 0;
    let totalSalePrice = quantity * price;

    // Match holdings
    for (const holding of availableHoldings) {
        if (remainingQty <= 0) break;

        const sellQty = Math.min(remainingQty, holding.quantity);
        const costPrice = holding.price * sellQty;
        totalCostPrice += costPrice;

        // Calculate holding period for tax
        const holdingDays = Math.floor((transactionDate - holding.buyDate) / (1000 * 60 * 60 * 24));
        const isLongTermHolding = holdingDays >= 365;

        // Update holding record
        holding.quantity -= sellQty;
        await holding.save({ session });

        matchedHoldings.push({
            holdingId: holding._id,
            soldQuantity: sellQty,
            buyPrice: holding.price,
            sellPrice: price,
            costPrice: costPrice,
            profitLoss: (price - holding.price) * sellQty,
            isLongTermHolding: isLongTermHolding
        });

        // Create ledger entry for each matched holding
        const ledgerEntry = await LedgerEntry.create(
            [{
                dematAccountId: dematAccountId,
                tradeTransactionId: transactionId,
                transactionAmount: price * sellQty,
                date: transactionDate,
                description: `SELL ${symbol} - ${sellQty} units @ ${price} (Bought @ ${holding.price}, Hold: ${holdingDays} days)`,
                transactionType: 'SELL',
                runningBalance: 0 // Will be calculated during FY update
            }],
            { session }
        );

        ledgerEntries.push(ledgerEntry[0]);

        remainingQty -= sellQty;
    }

    if (remainingQty > 0) {
        throw new Error(`Insufficient holdings. Available: ${quantity - remainingQty}, Requested: ${quantity}`);
    }

    return {
        matched: matchedHoldings,
        ledgerEntries: ledgerEntries,
        profitLoss: totalSalePrice - totalCostPrice
    };
};

/**
 * Update Financial Year with latest transactions and balances
 * @private
 */
const updateFinancialYearBalances = async (
    financialYearId,
    dematAccountId,
    transaction,
    session
) => {
    const financialYear = await FinancialYear.findById(financialYearId).session(session);

    if (!financialYear) {
        throw new Error('Financial year not found');
    }

    const dematAccountIdStr = dematAccountId.toString();
    const currentReport = financialYear.reports.get(dematAccountIdStr) || {
        holdings: [],
        openingBalance: 0,
        closingBalance: 0
    };

    // Update closing balance
    const dematAccount = await DematAccount.findById(dematAccountId).session(session);
    currentReport.closingBalance = dematAccount.balance;

    // Get latest holdings
    const latestHoldings = await Holdings.find({
        dematAccountId: dematAccountId
    }).session(session);

    currentReport.holdings = latestHoldings;

    financialYear.reports.set(dematAccountIdStr, currentReport);
    await financialYear.save({ session });
};

module.exports = {
    createTransactions
};
