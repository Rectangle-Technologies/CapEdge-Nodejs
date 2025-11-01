const FinancialYear = require("../models/FinancialYear");
const Holdings = require("../models/Holdings");
const Transaction = require("../models/Transaction");
const logger = require("../utils/logger");

const updateRecords = async (transactions, session) => {
    for (let transaction of transactions) {
        try {
            // Fetch the previous financial year
            const previousTransactionDate = new Date(transaction.date);
            previousTransactionDate.setFullYear(previousTransactionDate.getFullYear() - 1);
            const previousFinancialYear = await FinancialYear.findOne({
                startDate: { $lte: previousTransactionDate },
                endDate: { $gte: previousTransactionDate }
            }).session(session);

            if (!previousFinancialYear) {
                const error = new Error('Previous Financial year for this transaction does not exist');
                error.statusCode = 404;
                error.reasonCode = 'NOT_FOUND';
                throw error;
            }

            var previousHoldings = previousFinancialYear.reports.get(transaction.dematAccountId)?.holdings || [];
            var previousClosingBalance = previousFinancialYear.reports.get(transaction.dematAccountId)?.closingBalance || 0;
            var latestFY;

            // Fetch all the FY inluding and after the transaction date
            const financialYearsToUpdate = await FinancialYear.find({
                endDate: { $gte: transaction.date }
            }).session(session);

            for (let financialYear of financialYearsToUpdate) {
                // Fetch transactions for the FY
                const fyTransactions = await Transaction.find({
                    dematAccountId: transaction.dematAccountId,
                    financialYearId: financialYear._id
                }).session(session);

                // Update the opening balance of the FY
                let openingBalance = previousClosingBalance || 0;
                let closingBalance = openingBalance;
                const holdings = previousHoldings || [];

                // Loop over transactions to update holdings and balances
                for (let fyTransaction of fyTransactions) {
                    logger.info('-----------------------------------');
                    logger.info('Processing Transaction:', fyTransaction._id);
                    logger.info('Holdings before transaction:', holdings);
                    logger.info('Opening Balance before transaction:', openingBalance);
                    logger.info('Closing Balance before transaction:', closingBalance);

                    // Update holdings based on transaction type
                    if (fyTransaction.type === 'BUY') {
                        closingBalance += fyTransaction.quantity * fyTransaction.price;
                        holdings.push({
                            buyDate: fyTransaction.date,
                            quantity: fyTransaction.quantity,
                            price: fyTransaction.price,
                            securityId: fyTransaction.securityId,
                            transactionId: fyTransaction._id,
                            dematAccountId: fyTransaction.dematAccountId,
                            financialYearId: financialYear._id
                        });
                    } else if (fyTransaction.type === 'SELL') {
                        closingBalance -= fyTransaction.quantity * fyTransaction.price;
                        // Match with existing holdings (FIFO)
                        let quantityToSell = fyTransaction.quantity;
                        const holdingsForCurrentSecurity = holdings.filter(h => h.securityId.toString() === fyTransaction.securityId.toString());
                        for (let i = 0; i < holdingsForCurrentSecurity.length && quantityToSell > 0; i++) {
                            let holding = holdingsForCurrentSecurity[i];
                            if (holding.quantity <= quantityToSell) {
                                quantityToSell -= holding.quantity;
                                holdings.splice(holdings.indexOf(holding), 1);
                                i--; // Adjust index after removal
                            } else {
                                holding.quantity -= quantityToSell;
                                quantityToSell = 0;
                            }
                        }

                        if (quantityToSell > 0) {
                            const error = new Error('Not enough holdings to sell for transaction: ' + fyTransaction._id);
                            error.statusCode = 405;
                            error.reasonCode = 'NOT_ALLOWED';
                            throw error;
                        }
                    }
                }

                // Update the report for the financial year
                // financialYear.reports.set(transaction.dematAccountId.toString(), {
                //     holdings,
                //     openingBalance,
                //     closingBalance 
                // });

                latestFY = financialYear;
                previousHoldings = holdings;
                previousClosingBalance = closingBalance;

                logger.info('Updated Holdings:', holdings);
                logger.info('Updated Opening Balance:', openingBalance);
                logger.info('Updated Closing Balance:', closingBalance);
                logger.info('-----------------------------------');
                // await financialYear.save({ session });
            }

            // Fetch holdings for the previous FY

        } catch (error) {
            console.error('Error updating records for transaction:', error);
            throw error;
        }
    }
}

module.exports = {
    updateRecords
};