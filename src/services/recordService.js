const FinancialYear = require("../models/FinancialYear");
const Holdings = require("../models/Holdings");
const Transaction = require("../models/Transaction");
const DematAccount = require("../models/DematAccount");
const logger = require("../utils/logger");

const updateRecords = async (transactions, session) => {
    for (let transaction of transactions) {
        if (transaction.deliveryType === 'Intraday') {
            continue; // Skip intraday transactions
        }
        try {
            // Fetch the previous financial year
            console.log("------------------------------------Transaction------------------------------------");
            console.log("Processing transaction:", transaction);
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

            console.log(financialYearsToUpdate);
            
            for (let financialYear of financialYearsToUpdate) {
                console.log("--------------------------------Financial Years to Update------------------------------------");
                console.log("Updating Financial Year:", financialYear.title);
                // Fetch transactions for the FY
                const fyTransactions = await Transaction.find({
                    dematAccountId: transaction.dematAccountId,
                    financialYearId: financialYear._id
                }).sort({ date: 1 }).session(session);

                // Update the opening balance of the FY
                let openingBalance = previousClosingBalance || 0;
                let closingBalance = openingBalance;
                const holdings = previousHoldings.sort((a, b) => a.buyDate - b.buyDate) || [];

                console.log("FY Transactions:", fyTransactions);

                // Loop over transactions to update holdings and balances
                for (let fyTransaction of fyTransactions) {
                    console.log("--------------------------------FY Transaction------------------------------------");
                    console.log("Processing FY Transaction:", fyTransaction);
                    // Skip intraday transactions
                    if (fyTransaction.deliveryType === 'Intraday') {
                        console.log("Skipping intraday transaction");
                        continue;
                    }
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
                        console.log("Holdings for current security before sell:", holdingsForCurrentSecurity);
                        for (let i = 0; i < holdingsForCurrentSecurity.length && quantityToSell > 0; i++) {
                            console.log("--------------------------------Processing Holding------------------------------------");
                            console.log("Processing Holding:", holdingsForCurrentSecurity[i]);
                            console.log("Quantity to sell:", quantityToSell);
                            let holding = holdingsForCurrentSecurity[i];
                            if (holding.quantity <= quantityToSell) {
                                quantityToSell -= holding.quantity;
                                holdings.splice(holdings.indexOf(holding), 1);
                            } else {
                                holding.quantity -= quantityToSell;
                                quantityToSell = 0;
                            }
                        }

                        if (quantityToSell > 0) {
                            const error = new Error('Not enough holdings to sell for transaction: ' + fyTransaction._id);
                            error.statusCode = 400;
                            error.reasonCode = 'NOT_ALLOWED';
                            throw error;
                        }
                    }
                }

                // Update the report for the financial year
                financialYear.reports.set(transaction.dematAccountId.toString(), {
                    holdings,
                    openingBalance,
                    closingBalance 
                });

                latestFY = financialYear;
                previousHoldings = holdings;
                previousClosingBalance = closingBalance;
                await financialYear.save({ session });
            }

            // Delete holdings with matching securityId and dematAccountId from DB
            await Holdings.deleteMany({
                securityId: transaction.securityId,
                dematAccountId: transaction.dematAccountId
            }).session(session);

            // Re-insert updated holdings into the Holdings collection
            const holdingsToInsert = previousHoldings.map(h => ({
                buyDate: h.buyDate,
                quantity: h.quantity,
                price: h.price,
                securityId: h.securityId,
                transactionId: h.transactionId,
                dematAccountId: h.dematAccountId,
                financialYearId: latestFY._id
            }));

            // Update closing balance in demat account in DB
            await DematAccount.updateOne(
                { _id: transaction.dematAccountId },
                { balance: previousClosingBalance },
                { session }
            );

            await Holdings.insertMany(holdingsToInsert, { session });

            // Clear reports map to free memory
            latestFY.reports = new Map();
            await latestFY.save({ session });

        } catch (error) {
            console.error('Error updating records for transaction:', error);
            throw error;
        }
    }
}

module.exports = {
    updateRecords
};