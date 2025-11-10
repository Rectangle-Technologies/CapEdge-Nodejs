const DematAccount = require("../models/DematAccount");
const FinancialYear = require("../models/FinancialYear");
const Transaction = require("../models/Transaction");

const getPnLRecords = async (data) => {
  // Logic to get P&L records
  const { financialYearId, dematAccountId } = data;

  const financialYear = await FinancialYear.findById(financialYearId);
  if (!financialYear) {
    const error = new Error('Financial Year not found');
    error.statusCode = 404;
    error.reasonCode = 'NOT_FOUND';
    throw error;
  }

  const dematAccount = await DematAccount.findById(dematAccountId);
  if (!dematAccount) {
    const error = new Error('Demat Account not found');
    error.statusCode = 404;
    error.reasonCode = 'NOT_FOUND';
    throw error;
  }

  const previousFinancialYear = await FinancialYear.findOne({
    endDate: { $lt: financialYear.startDate }
  }).sort({ endDate: -1 });

  if (!previousFinancialYear) {
    const error = new Error('Previous Financial Year not found');
    error.statusCode = 404;
    error.reasonCode = 'NOT_FOUND';
    throw error;
  }

  const prevFYHoldingsObj = previousFinancialYear.reports.get(dematAccountId)?.holdings || [];
  const prevFYHoldings = Array.isArray(prevFYHoldingsObj)
    ? prevFYHoldingsObj.map(h => ({ ...h }))
    : [];
  prevFYHoldings.sort((a, b) => a.buyDate - b.buyDate);

  const currentFYTransactions = await Transaction.find({ financialYearId, dematAccountId }).sort({ date: 1, createdAt: 1 });

  const result = {};
  result.startDate = financialYear.startDate;
  result.endDate = currentFYTransactions[currentFYTransactions.length - 1]?.date || financialYear.endDate;

  for (const txn of currentFYTransactions) {
    if (txn.deliveryType === 'Delivery') {
      if (txn.type === 'BUY') {
        prevFYHoldings.push({
          buyDate: txn.date,
          quantity: txn.quantity,
          price: txn.price,
          securityId: txn.securityId,
          transactionId: txn._id,
          dematAccountId: txn.dematAccountId,
          financialYearId: txn.financialYearId
        });
      } else {
        let quantityToMatch = txn.quantity;

        const holdingsForSecurity = prevFYHoldings.filter(h => h.securityId.toString() === txn.securityId.toString());

        for (const holding of holdingsForSecurity) {
          if (quantityToMatch <= 0) break;

          if (holding.quantity > quantityToMatch) {
            holding.quantity -= quantityToMatch;
            quantityToMatch = 0;
          } else {
            quantityToMatch -= holding.quantity;
            prevFYHoldings.splice(prevFYHoldings.indexOf(holding), 1);
          }

          const resultType = txn.price >= holding.price ? 'gain' : 'loss';
          const daysHeld = Math.ceil((txn.date - holding.buyDate) / (1000 * 60 * 60 * 24));
          const gainType = daysHeld > 365 ? 'LTCG' : 'STCG';
          const taxableAmount = (txn.price - holding.price) * Math.min(holding.quantity, txn.quantity);
          var calculatedTax = 0;
          if (taxableAmount > 0) {
            if (gainType === 'LTCG') {
              calculatedTax = taxableAmount * financialYear.ltcgRate;
            } else {
              calculatedTax = taxableAmount * financialYear.stcgRate;
            }
          }

          if (!result[txn.securityId]) {
            result[txn.securityId] = [];
          }
          result[txn.securityId].push({
            buyDate: holding.buyDate,
            sellDate: txn.date,
            quantity: Math.min(holding.quantity, txn.quantity),
            buyPrice: holding.price,
            sellPrice: txn.price,
            transactionId: txn._id,
            resultType,
            gainType,
            calculatedTax
          });
        }
      }
    } else {
      if (txn.type === 'BUY') {
        const sellTransaction = await Transaction.findOne({ buyTransactionId: txn._id });

        if (sellTransaction) {
          const resultType = sellTransaction.price >= txn.price ? 'gain' : 'loss';
          const gainType = 'STCG';
          const taxableAmount = (sellTransaction.price - txn.price) * txn.quantity;
          var calculatedTax = 0;
          if (taxableAmount > 0) {
            calculatedTax = taxableAmount * financialYear.stcgRate;
          }

          if (!result[txn.securityId]) {
            result[txn.securityId] = [];
          }
          result[txn.securityId].push({
            buyDate: txn.date,
            sellDate: sellTransaction.date,
            quantity: txn.quantity,
            buyPrice: txn.price,
            sellPrice: sellTransaction.price,
            transactionId: sellTransaction._id,
            resultType,
            gainType,
            calculatedTax
          });
        }
      }
    }
  }

  return result;
}

module.exports = {
  getPnLRecords
};
