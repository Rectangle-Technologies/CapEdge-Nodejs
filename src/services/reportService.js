const DematAccount = require("../models/DematAccount");
const FinancialYear = require("../models/FinancialYear");
const Transaction = require("../models/Transaction");
const { getGainType } = require("../utils/helpers");

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

  // Validate financial year has required tax rates
  if (financialYear.ltcgRate === undefined || financialYear.ltcgRate === null ||
    financialYear.stcgRate === undefined || financialYear.stcgRate === null) {
    const error = new Error('Financial Year tax rates are not configured');
    error.statusCode = 400;
    error.reasonCode = 'INVALID_DATA';
    throw error;
  }

  const dematAccountExists = await DematAccount.exists({ _id: dematAccountId });
  if (!dematAccountExists) {
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
    ? prevFYHoldingsObj.map(h => h.toObject ? h.toObject() : h)
    : [];
  prevFYHoldings.sort((a, b) => a.buyDate - b.buyDate);

  const currentFYTransactions = await Transaction.find({ financialYearId, dematAccountId }).sort({ date: 1, createdAt: 1 });

  // Fetch all intraday sell transactions upfront for performance
  const intradayBuyTransactionIds = currentFYTransactions
    .filter(txn => txn.deliveryType !== 'Delivery' && txn.type === 'BUY')
    .map(txn => txn._id);

  const intradaySellMap = new Map();
  if (intradayBuyTransactionIds.length > 0) {
    const intradaySellTransactions = await Transaction.find({
      buyTransactionId: { $in: intradayBuyTransactionIds }
    });

    intradaySellTransactions.forEach(txn => {
      intradaySellMap.set(txn.buyTransactionId.toString(), txn);
    });
  }

  const result = {};
  const currentDate = new Date();
  const currentFY = await FinancialYear.findOne({
    startDate: { $lte: currentDate },
    endDate: { $gte: currentDate }
  });
  result.startDate = financialYear.startDate;
  result.endDate = currentFY._id.toString() === financialYear._id.toString() ? currentDate : financialYear.endDate;

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
      } else if (txn.type === 'SELL') {
        let quantityToMatch = txn.quantity;

        const holdingsForSecurity = prevFYHoldings.filter(h => h.securityId.toString() === txn.securityId.toString());
        const holdingsToRemove = [];

        for (const holding of holdingsForSecurity) {
          if (quantityToMatch <= 0) break;

          let matchedQuantity = 0;
          if (holding.quantity > quantityToMatch) {
            holding.quantity -= quantityToMatch;
            matchedQuantity = quantityToMatch;
            quantityToMatch = 0;
          } else {
            quantityToMatch -= holding.quantity;
            matchedQuantity = holding.quantity;
            holdingsToRemove.push(holding);
          }

          const resultType = txn.price >= holding.price ? 'gain' : 'loss';
          const gainType = getGainType(holding.buyDate, txn.date, 'EQUITY');
          const taxableAmount = (txn.price - holding.price) * matchedQuantity;
          let calculatedTax = 0;
          if (gainType === 'LTCG') {
            calculatedTax = taxableAmount * financialYear.ltcgRate;
          } else {
            calculatedTax = taxableAmount * financialYear.stcgRate;
          }

          if (!result[txn.securityId]) {
            result[txn.securityId] = [];
          }
          result[txn.securityId].push({
            buyDate: holding.buyDate,
            sellDate: txn.date,
            quantity: matchedQuantity,
            buyPrice: holding.price,
            sellPrice: txn.price,
            transactionId: txn._id,
            resultType,
            gainType,
            calculatedTax
          });
        }

        // Remove fully matched holdings after iteration
        holdingsToRemove.forEach(holding => {
          const index = prevFYHoldings.indexOf(holding);
          if (index > -1) {
            prevFYHoldings.splice(index, 1);
          }
        });
      }
    } else {
      if (txn.type === 'BUY') {
        const sellTransaction = intradaySellMap.get(txn._id.toString());

        if (sellTransaction) {
          const resultType = sellTransaction.price >= txn.price ? 'gain' : 'loss';
          const gainType = 'STCG';
          const taxableAmount = (sellTransaction.price - txn.price) * txn.quantity;
          let calculatedTax = 0;
          calculatedTax = taxableAmount * financialYear.stcgRate;

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
