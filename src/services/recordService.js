const FinancialYear = require("../models/FinancialYear");
const Holdings = require("../models/Holdings");
const Transaction = require("../models/Transaction");
const DematAccount = require("../models/DematAccount");
const LedgerEntry = require("../models/LedgerEntry");
const Security = require("../models/Security");
const { Types: { ObjectId } } = require("mongoose");
const { toUTCDateOnly } = require("../utils/dateOnly");

const updateRecords = async (transactionDate, dematAccountId, session) => {
    // Timing only (logged once in `finally`): where a slow rebuild spends its time. Each lap() adds the time since
    // the previous lap to one bucket, so the bucket of a database call includes the small in-memory work before it.
    const startedAt = Date.now();
    const spent = { reads: 0, ledgerWrites: 0, yearSaves: 0, holdings: 0 };
    let mark = startedAt;
    const lap = (bucket) => { const now = Date.now(); spent[bucket] += now - mark; mark = now; };
    let yearsRebuilt = 0;
    // Each year holds the snapshots of EVERY demat (about 0.5 MB in total); a rebuild only needs this demat's
    // own snapshot, so only that part of the report is read from the database. The years are read as plain
    // objects and this demat's snapshot is written back with a direct update: building and saving Mongoose
    // documents holding ~900 holdings per year was the bulk of the rebuild time.
    const dematKey = String(dematAccountId);
    const yearProjection = { startDate: 1, endDate: 1, [`reports.${dematKey}`]: 1 };
    try {
        // Fetch the previous financial year
        const previousTransactionDate = new Date(transactionDate);
        previousTransactionDate.setUTCFullYear(previousTransactionDate.getUTCFullYear() - 1); // UTC: same calendar day, a year earlier
        const previousFinancialYear = await FinancialYear.findOne({
            startDate: { $lte: previousTransactionDate },
            endDate: { $gte: previousTransactionDate }
        }, yearProjection).lean().session(session);
        lap('reads');

        if (!previousFinancialYear) {
            const prevDateStr = previousTransactionDate.toISOString().slice(0, 10);
            console.error(`[updateRecords] no prev FY for transactionDate=${new Date(transactionDate).toISOString().slice(0,10)} (looking for FY containing ${prevDateStr})`);
            const error = new Error('Cannot process this transaction — its date falls before the earliest configured financial year. Please add the missing financial year first and try again.');
            error.statusCode = 404;
            error.reasonCode = 'NOT_FOUND';
            throw error;
        }

        var previousHoldings = previousFinancialYear.reports?.[dematKey]?.holdings || [];
        var previousClosingBalance = previousFinancialYear.reports?.[dematKey]?.closingBalance || 0;
        var latestFY;

        // Fetch all the FY including and after the transaction date, sorted chronologically
        const financialYearsToUpdate = await FinancialYear.find({
            endDate: { $gte: transactionDate }
        }, yearProjection).sort({ startDate: 1 }).lean().session(session);
        lap('reads');
        const now = new Date();

        // The trades and ledger entries of all the years are read in one query each (a query per year cost a
        // round trip each, and the ledger has no index for it) and handed out per year below
        const tradesByYear = new Map();
        const ledgerByYear = new Map();
        if (financialYearsToUpdate.length > 0) {
            // grouped in the order the database returns them: the same-date order of the per-year queries is kept
            const trades = await Transaction.find({
                dematAccountId: dematAccountId,
                financialYearId: { $in: financialYearsToUpdate.map(y => y._id) }
            }).sort({ date: 1 }).lean().session(session);
            for (const trade of trades) {
                const key = String(trade.financialYearId);
                if (!tradesByYear.has(key)) tradesByYear.set(key, []);
                tradesByYear.get(key).push(trade);
            }

            // the years are consecutive and sorted, so one pass over the date-sorted entries hands each to its year;
            // an entry that falls in no year (a gap between years) is left out, as the per-year date filter did
            const ledger = await LedgerEntry.find({
                dematAccountId: dematAccountId,
                date: { $gte: financialYearsToUpdate[0].startDate, $lte: financialYearsToUpdate[financialYearsToUpdate.length - 1].endDate }
            }).sort({ date: 1, createdAt: 1, _id: 1 }).lean().session(session);
            let yearIdx = 0;
            for (const entry of ledger) {
                while (yearIdx < financialYearsToUpdate.length && entry.date > financialYearsToUpdate[yearIdx].endDate) yearIdx++;
                if (yearIdx === financialYearsToUpdate.length) break;
                if (entry.date < financialYearsToUpdate[yearIdx].startDate) continue;
                const key = String(financialYearsToUpdate[yearIdx]._id);
                if (!ledgerByYear.has(key)) ledgerByYear.set(key, []);
                ledgerByYear.get(key).push(entry);
            }
            lap('reads');
        }

        for (const [yearIndex, financialYear] of financialYearsToUpdate.entries()) {
            yearsRebuilt++;
            const fyTransactions = tradesByYear.get(String(financialYear._id)) || [];

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
                        // plain object stored as is: the id, timestamps and date normalisation a Mongoose sub-document
                        // would have added are set here (the id is generated once, here, and travels with the holding)
                        holdings.push({
                            _id: new ObjectId(),
                            buyDate: toUTCDateOnly(fyTransaction.date),
                            quantity: fyTransaction.quantity,
                            price: fyTransaction.price,
                            transactionCost: fyTransaction.transactionCost || 0,
                            securityId: fyTransaction.securityId,
                            transactionId: fyTransaction._id,
                            dematAccountId: fyTransaction.dematAccountId,
                            financialYearId: financialYear._id,
                            createdAt: now,
                            updatedAt: now
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

            const ledgerEntries = ledgerByYear.get(String(financialYear._id)) || [];

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

            latestFY = financialYear;
            previousHoldings = holdings;
            previousClosingBalance = closingBalance;

            // Update the report for the financial year (only this demat's snapshot is touched). The newest year
            // keeps no snapshots (they are cleared below once the holdings are re-inserted), so it is not written.
            // The update is awaited before the next year changes `holdings` in place: the driver serialises the
            // object when it is called, so each year stores its own state. Do not pipeline or batch these updates
            // without copying `holdings` first.
            if (yearIndex < financialYearsToUpdate.length - 1) {
                await FinancialYear.collection.updateOne(
                    { _id: financialYear._id },
                    { $set: { [`reports.${dematKey}`]: { holdings, openingBalance, closingBalance, _id: new ObjectId() }, updatedAt: new Date() } },
                    { session }
                );
            }
            lap('yearSaves');
        }

        // Bring the demat's rows in the Holdings collection to the rebuilt holdings. Only the rows that differ are
        // written (a rebuild usually changes none or a few of the hundreds): rows are matched by transactionId, which
        // is unique, and a row that already matches is left as it is.
        const holdingsToWrite = previousHoldings.map(h => ({
            buyDate: h.buyDate, // → UTC midnight via Holdings model setter
            quantity: h.quantity,
            price: h.price,
            securityId: h.securityId,
            transactionId: h.transactionId,
            dematAccountId: h.dematAccountId,
            financialYearId: latestFY._id
        }));
        const currentRows = await Holdings.find({ dematAccountId }).lean().session(session);
        const currentByTransaction = new Map(currentRows.map(row => [String(row.transactionId), row]));
        const holdingsOps = [];
        const wantedTransactions = new Set();
        for (const wanted of holdingsToWrite) {
            const key = String(wanted.transactionId);
            wantedTransactions.add(key);
            const row = currentByTransaction.get(key);
            if (!row) {
                holdingsOps.push({ insertOne: { document: wanted } });
            } else if (
                +row.buyDate !== +toUTCDateOnly(wanted.buyDate) || row.quantity !== wanted.quantity || row.price !== wanted.price ||
                String(row.securityId) !== String(wanted.securityId) || String(row.dematAccountId) !== String(wanted.dematAccountId) ||
                String(row.financialYearId) !== String(wanted.financialYearId) || (row.transactionCost || 0) !== 0
            ) {
                // a row inserted without a cost has transactionCost 0 (the schema default), so a rewritten row gets 0 as well
                holdingsOps.push({ updateOne: { filter: { _id: row._id }, update: { $set: { ...wanted, transactionCost: 0 } } } });
            }
        }
        const staleRowIds = currentRows.filter(row => !wantedTransactions.has(String(row.transactionId))).map(row => row._id);
        if (staleRowIds.length > 0) holdingsOps.unshift({ deleteMany: { filter: { _id: { $in: staleRowIds } } } });

        // Update closing balance in demat account in DB
        await DematAccount.updateOne(
            { _id: dematAccountId },
            { balance: previousClosingBalance },
            { session }
        );

        if (holdingsOps.length > 0) await Holdings.bulkWrite(holdingsOps, { session });

        // Clear reports map to free memory
        await FinancialYear.collection.updateOne(
            { _id: latestFY._id },
            { $set: { reports: {}, updatedAt: new Date() } },
            { session }
        );
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