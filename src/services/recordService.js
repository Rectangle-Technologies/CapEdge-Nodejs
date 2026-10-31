const FinancialYear = require("../models/FinancialYear");
const Holdings = require("../models/Holdings");
const Transaction = require("../models/Transaction");
const DematAccount = require("../models/DematAccount");
const LedgerEntry = require("../models/LedgerEntry");
const Security = require("../models/Security");

const updateRecords = async (transactionDate, dematAccountId, session) => {
    // Timing only (logged once in `finally`): where a slow rebuild spends its time. Each lap() adds the time since
    // the previous lap to one bucket, so the bucket of a database call includes the small in-memory work before it.
    const startedAt = Date.now();
    const spent = { reads: 0, ledgerWrites: 0, yearSaves: 0, holdings: 0 };
    let mark = startedAt;
    const lap = (bucket) => { const now = Date.now(); spent[bucket] += now - mark; mark = now; };
    let yearsRebuilt = 0;
    // Each year holds the snapshots of EVERY demat (about 0.5 MB in total); a rebuild only needs this demat's
    // own snapshot, so only that part of the report is read from the database
    const dematKey = String(dematAccountId);
    const yearProjection = { startDate: 1, endDate: 1, [`reports.${dematKey}`]: 1 };
    try {
        // Fetch the previous financial year
        const previousTransactionDate = new Date(transactionDate);
        previousTransactionDate.setUTCFullYear(previousTransactionDate.getUTCFullYear() - 1); // UTC: same calendar day, a year earlier
        const previousFinancialYear = await FinancialYear.findOne({
            startDate: { $lte: previousTransactionDate },
            endDate: { $gte: previousTransactionDate }
        }, yearProjection).session(session);
        lap('reads');

        if (!previousFinancialYear) {
            const prevDateStr = previousTransactionDate.toISOString().slice(0, 10);
            console.error(`[updateRecords] no prev FY for transactionDate=${new Date(transactionDate).toISOString().slice(0,10)} (looking for FY containing ${prevDateStr})`);
            const error = new Error('Cannot process this transaction — its date falls before the earliest configured financial year. Please add the missing financial year first and try again.');
            error.statusCode = 404;
            error.reasonCode = 'NOT_FOUND';
            throw error;
        }

        var previousHoldings = previousFinancialYear.reports.get(dematKey)?.holdings || [];
        var previousClosingBalance = previousFinancialYear.reports.get(dematKey)?.closingBalance || 0;
        var latestFY;

        // Fetch all the FY including and after the transaction date, sorted chronologically
        const financialYearsToUpdate = await FinancialYear.find({
            endDate: { $gte: transactionDate }
        }, yearProjection).sort({ startDate: 1 }).session(session);
        lap('reads');

        for (let financialYear of financialYearsToUpdate) {
            yearsRebuilt++;
            // Fetch transactions for the FY
            const fyTransactions = await Transaction.find({
                dematAccountId: dematAccountId,
                financialYearId: financialYear._id
            }).sort({ date: 1 }).session(session);
            lap('reads');

            // Update the opening balance of the FY
            let openingBalance = previousClosingBalance || 0;
            let closingBalance = openingBalance;
            const holdings = previousHoldings.sort((a, b) => a.buyDate - b.buyDate) || [];

            // Loop over transactions ONLY to maintain holdings (FIFO matching).
            // closingBalance is computed exclusively from ledger entries below to
            // avoid double-counting trades (each trade already has a corresponding
            // LedgerEntry with transactionAmount = ±qty*price).
            for (let fyTransaction of fyTransactions) {
                if (fyTransaction.type === 'BUY') {
                    if (fyTransaction.deliveryType === 'Delivery') {
                        holdings.push({
                            buyDate: fyTransaction.date, // → UTC midnight via Holdings model setter
                            quantity: fyTransaction.quantity,
                            price: fyTransaction.price,
                            transactionCost: fyTransaction.transactionCost || 0,
                            securityId: fyTransaction.securityId,
                            transactionId: fyTransaction._id,
                            dematAccountId: fyTransaction.dematAccountId,
                            financialYearId: financialYear._id
                        });
                    }
                } else if (fyTransaction.type === 'SELL') {
                    if (fyTransaction.deliveryType === 'Delivery') {
                        // Match with existing holdings (FIFO)
                        let quantityToSell = fyTransaction.quantity;
                        const holdingsForCurrentSecurity = holdings.filter(h => h.securityId.toString() === fyTransaction.securityId.toString());
                        for (let i = 0; i < holdingsForCurrentSecurity.length && quantityToSell > 0; i++) {
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
                            const sec = await Security.findById(fyTransaction.securityId).session(session);
                            const secName = sec?.name || 'Unknown security';
                            const sellDateStr = new Date(fyTransaction.date).toISOString().slice(0, 10);
                            const fulfilled = fyTransaction.quantity - quantityToSell;
                            console.error(
                                `[updateRecords] not enough holdings to sell: txId=${fyTransaction._id} secId=${fyTransaction.securityId} demId=${dematAccountId} sellQty=${fyTransaction.quantity} fulfilled=${fulfilled} shortfall=${quantityToSell}`
                            );
                            const error = new Error(
                                `Cannot process SELL of ${fyTransaction.quantity} ${secName} on ${sellDateStr} — only ${fulfilled} shares available in this demat account for that security.`
                            );
                            error.statusCode = 400;
                            error.reasonCode = 'NOT_ALLOWED';
                            throw error;
                        }
                    }
                }
            }

            const ledgerEntries = await LedgerEntry.find({
                dematAccountId: dematAccountId,
                date: { $gte: financialYear.startDate, $lte: financialYear.endDate }
            }).sort({ date: 1, createdAt: 1, _id: 1 }).session(session);
            lap('reads');

            // Compute running balance for every entry (trade-linked or not) and
            // collect bulk updates. Each ledger entry — including those auto-
            // created from trades — contributes to closingBalance exactly once.
            // Only entries whose stored balance differs are written (a missing/null
            // balance counts as different): a rebuild that changes no cash, such as a
            // stock split, would otherwise rewrite every balance with the same value.
            const balanceBulkOps = [];
            for (let entry of ledgerEntries) {
                closingBalance += entry.transactionAmount;
                if (entry.balanceAfterEntry === closingBalance) continue;
                balanceBulkOps.push({
                    updateOne: {
                        filter: { _id: entry._id },
                        update: { $set: { balanceAfterEntry: closingBalance } }
                    }
                });
            }

            if (balanceBulkOps.length > 0) {
                await LedgerEntry.bulkWrite(balanceBulkOps, { session });
                lap('ledgerWrites');
            }

            // Update the report for the financial year
            financialYear.reports.set(dematKey, {
                holdings,
                openingBalance,
                closingBalance
            });

            latestFY = financialYear;
            previousHoldings = holdings;
            previousClosingBalance = closingBalance;
            await financialYear.save({ session });
            lap('yearSaves');
        }

        // Delete holdings with matching dematAccountId from DB
        await Holdings.deleteMany({
            dematAccountId
        }).session(session);

        // Re-insert updated holdings into the Holdings collection
        const holdingsToInsert = previousHoldings.map(h => ({
            buyDate: h.buyDate, // → UTC midnight via Holdings model setter (insertMany)
            quantity: h.quantity,
            price: h.price,
            securityId: h.securityId,
            transactionId: h.transactionId,
            dematAccountId: h.dematAccountId,
            financialYearId: latestFY._id
        }));

        // Update closing balance in demat account in DB
        await DematAccount.updateOne(
            { _id: dematAccountId },
            { balance: previousClosingBalance },
            { session }
        );

        await Holdings.insertMany(holdingsToInsert, { session });

        // Clear reports map to free memory
        latestFY.reports = new Map();
        await latestFY.save({ session });
        lap('holdings');

    } catch (error) {
        console.error('Error updating records for transaction:', error);
        throw error;
    } finally {
        const from = new Date(transactionDate);
        console.log(`[updateRecords] demat=${dematAccountId} from=${Number.isNaN(+from) ? 'invalid' : from.toISOString().slice(0, 10)} years=${yearsRebuilt} total=${Date.now() - startedAt}ms ` +
            `reads=${spent.reads}ms ledgerWrites=${spent.ledgerWrites}ms yearSaves=${spent.yearSaves}ms holdings=${spent.holdings}ms`);
    }
}

module.exports = {
    updateRecords
};