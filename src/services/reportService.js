const DematAccount = require("../models/DematAccount");
const FinancialYear = require("../models/FinancialYear");
const Holdings = require("../models/Holdings");
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

const getHoldingsRecords = async () => {
  // Fetch all holdings populated with dematAccountId and securityId details
  const holdings = await Holdings.find()
    .populate({
      path: 'dematAccountId',
      populate: [
        { path: 'userAccountId' },
        { path: 'brokerId' }
      ]
    })
    .populate('securityId')
    .exec();

  // Group holdings by securityId, then by dematAccountId
  const groupedData = {};

  holdings.forEach(holding => {
    const security = holding.securityId;
    const securityId = security._id.toString();
    const securityName = security.name;
    const dematAccount = holding.dematAccountId;
    const dematAccountId = dematAccount._id.toString();
    const userAccountName = dematAccount.userAccountId.name;
    const brokerName = dematAccount.brokerId.name;
    const accountLabel = `${userAccountName} - ${brokerName}`;

    // Initialize security group if it doesn't exist
    if (!groupedData[securityId]) {
      groupedData[securityId] = {
        securityName,
        securityId,
        dematAccounts: {}
      };
    }

    // Initialize demat account group if it doesn't exist
    if (!groupedData[securityId].dematAccounts[dematAccountId]) {
      groupedData[securityId].dematAccounts[dematAccountId] = {
        accountLabel,
        userAccountName,
        brokerName,
        dematAccountId,
        holdings: []
      };
    }

    // Add holding to the demat account group
    groupedData[securityId].dematAccounts[dematAccountId].holdings.push({
      buyDate: holding.buyDate,
      quantity: holding.quantity,
      price: holding.price,
      amount: holding.quantity * holding.price
    });
  });

  // Convert to array format and sort
  const result = Object.values(groupedData)
    .map(security => {
      // Convert dematAccounts object to array and calculate totals
      const dematAccountsArray = Object.values(security.dematAccounts).map(account => {
        // Sort holdings by date
        account.holdings.sort((a, b) => new Date(a.buyDate) - new Date(b.buyDate));
        
        // Calculate totals for this demat account
        const totalQuantity = account.holdings.reduce((sum, h) => sum + h.quantity, 0);
        const totalAmount = account.holdings.reduce((sum, h) => sum + h.amount, 0);
        const avgPrice = totalAmount / totalQuantity;

        return {
          ...account,
          total: {
            quantity: totalQuantity,
            price: avgPrice,
            amount: totalAmount
          }
        };
      });

      // Sort demat accounts by userAccountName, then brokerName
      dematAccountsArray.sort((a, b) => {
        const userCompare = a.userAccountName.localeCompare(b.userAccountName);
        if (userCompare !== 0) return userCompare;
        return a.brokerName.localeCompare(b.brokerName);
      });

      return {
        securityName: security.securityName,
        securityId: security.securityId,
        dematAccounts: dematAccountsArray
      };
    });

  // Sort by security name
  result.sort((a, b) => a.securityName.localeCompare(b.securityName));

  return result;
}

module.exports = {
  getPnLRecords,
  getHoldingsRecords
};
