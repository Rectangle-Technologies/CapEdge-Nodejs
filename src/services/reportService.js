const DematAccount = require("../models/DematAccount");
const FinancialYear = require("../models/FinancialYear");
const Holdings = require("../models/Holdings");
const LedgerEntry = require("../models/LedgerEntry");
const Transaction = require("../models/Transaction");
const Security = require("../models/Security");
const UserAccount = require("../models/UserAccount");
const Broker = require("../models/Broker");
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
    .filter(txn => txn.deliveryType === 'Intraday' && txn.type === 'BUY')
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
          const taxableAmount = ((txn.price - holding.price) * matchedQuantity) - txn.transactionCost - holding.transactionCost;
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
            transactionCost: (txn.transactionCost || 0) + (holding.transactionCost || 0),
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
          const taxableAmount = ((sellTransaction.price - txn.price) * txn.quantity) - (sellTransaction.transactionCost || 0) - (txn.transactionCost || 0);
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
            transactionCost: (sellTransaction.transactionCost || 0) + (txn.transactionCost || 0),
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

/**
 * Get holdings records from FinancialYear report (historical financial years)
 * @param {String} financialYearId - The financial year ID to fetch from
 * @returns {Promise<Array>} - Structured holdings data
 */
const getHoldingsRecordsFromReport = async (financialYearId) => {
  // Fetch the financial year with its reports
  const financialYear = await FinancialYear.findById(financialYearId).lean();
  
  if (!financialYear || !financialYear.reports) {
    return [];
  }

  // Collect all holdings from all demat accounts in the reports
  const allHoldings = [];
  const dematAccountIds = Object.keys(financialYear.reports);

  for (const dematId of dematAccountIds) {
    const report = financialYear.reports[dematId];
    if (report && report.holdings) {
      report.holdings.forEach(holding => {
        allHoldings.push({
          ...holding,
          dematAccountId: dematId
        });
      });
    }
  }

  if (allHoldings.length === 0) {
    return [];
  }

  // Get unique IDs for batch fetching
  const securityIds = [...new Set(allHoldings.map(h => h.securityId).filter(Boolean))];
  const dematIds = [...new Set(allHoldings.map(h => h.dematAccountId).filter(Boolean))];

  // Fetch all related documents
  const [securities, dematAccounts] = await Promise.all([
    Security.find({ _id: { $in: securityIds } }).lean(),
    DematAccount.find({ _id: { $in: dematIds } }).populate('brokerId').populate('userAccountId').lean()
  ]);

  // Create lookup maps
  const securityMap = new Map(securities.map(s => [s._id.toString(), s]));
  const dematMap = new Map(dematAccounts.map(d => [d._id.toString(), d]));

  // Process holdings and group them
  const groupedData = {};

  for (const holding of allHoldings) {
    const securityId = holding.securityId.toString();
    const dematAccountId = holding.dematAccountId.toString();
    
    const security = securityMap.get(securityId);
    const dematAccount = dematMap.get(dematAccountId);

    if (!security || !dematAccount) continue;

    const amount = holding.quantity * holding.price;

    // Group by security
    if (!groupedData[securityId]) {
      groupedData[securityId] = {
        securityId: security._id,
        securityName: security.name,
        dematAccounts: {}
      };
    }

    // Group by demat account within security
    if (!groupedData[securityId].dematAccounts[dematAccountId]) {
      const userAccount = dematAccount.userAccountId;
      const broker = dematAccount.brokerId;
      
      groupedData[securityId].dematAccounts[dematAccountId] = {
        accountLabel: `${userAccount.name} - ${broker.name}`,
        userAccountName: userAccount.name,
        brokerName: broker.name,
        dematAccountId: dematAccount._id,
        holdings: [],
        totalQuantity: 0,
        totalAmount: 0
      };
    }

    // Add holding to the group
    groupedData[securityId].dematAccounts[dematAccountId].holdings.push({
      buyDate: holding.buyDate,
      quantity: holding.quantity,
      price: holding.price,
      amount: amount
    });

    groupedData[securityId].dematAccounts[dematAccountId].totalQuantity += holding.quantity;
    groupedData[securityId].dematAccounts[dematAccountId].totalAmount += amount;
  }

  // Convert to array format and calculate averages
  const result = Object.values(groupedData).map(securityGroup => {
    const dematAccountsArray = Object.values(securityGroup.dematAccounts).map(dematGroup => {
      // Sort holdings by buyDate
      dematGroup.holdings.sort((a, b) => new Date(a.buyDate) - new Date(b.buyDate));

      return {
        accountLabel: dematGroup.accountLabel,
        userAccountName: dematGroup.userAccountName,
        brokerName: dematGroup.brokerName,
        dematAccountId: dematGroup.dematAccountId,
        holdings: dematGroup.holdings,
        total: {
          quantity: dematGroup.totalQuantity,
          price: dematGroup.totalAmount / dematGroup.totalQuantity,
          amount: dematGroup.totalAmount
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
      securityId: securityGroup.securityId,
      securityName: securityGroup.securityName,
      dematAccounts: dematAccountsArray
    };
  });

  // Sort by security name
  result.sort((a, b) => a.securityName.localeCompare(b.securityName));

  return result;
};

const getHoldingsRecords = async (financialYearId) => {
  // Determine whether to fetch from Holdings collection or FinancialYear report
  let shouldFetchFromCollection = true;

  if (financialYearId) {
    // Get the latest financial year
    const latestFinancialYear = await FinancialYear.findOne()
      .sort({ startDate: -1 })
      .select('_id')
      .lean();

    // If financialYearId is not the latest, fetch from report
    if (latestFinancialYear && financialYearId.toString() !== latestFinancialYear._id.toString()) {
      shouldFetchFromCollection = false;
    }
  }

  if (!shouldFetchFromCollection) {
    // Fetch from FinancialYear report (historical data)
    return await getHoldingsRecordsFromReport(financialYearId);
  }

  // Fetch from Holdings collection (current/latest financial year)
  const result = await Holdings.aggregate([
    // Join with Security
    {
      $lookup: {
        from: 'securities',
        localField: 'securityId',
        foreignField: '_id',
        as: 'security'
      }
    },
    { $unwind: '$security' },
    
    // Join with DematAccount
    {
      $lookup: {
        from: 'demataccounts',
        localField: 'dematAccountId',
        foreignField: '_id',
        as: 'dematAccount'
      }
    },
    { $unwind: '$dematAccount' },
    
    // Join with UserAccount
    {
      $lookup: {
        from: 'useraccounts',
        localField: 'dematAccount.userAccountId',
        foreignField: '_id',
        as: 'userAccount'
      }
    },
    { $unwind: '$userAccount' },
    
    // Join with Broker
    {
      $lookup: {
        from: 'brokers',
        localField: 'dematAccount.brokerId',
        foreignField: '_id',
        as: 'broker'
      }
    },
    { $unwind: '$broker' },
    
    // Add computed fields
    {
      $addFields: {
        amount: { $multiply: ['$quantity', '$price'] },
        accountLabel: { 
          $concat: ['$userAccount.name', ' - ', '$broker.name'] 
        }
      }
    },
    
    // Sort holdings by date within each group
    { $sort: { 'security._id': 1, 'dematAccount._id': 1, buyDate: 1 } },
    
    // Group by security and demat account
    {
      $group: {
        _id: {
          securityId: '$security._id',
          securityName: '$security.name',
          dematAccountId: '$dematAccount._id',
          accountLabel: '$accountLabel',
          userAccountName: '$userAccount.name',
          brokerName: '$broker.name'
        },
        holdings: {
          $push: {
            buyDate: '$buyDate',
            quantity: '$quantity',
            price: '$price',
            amount: '$amount'
          }
        },
        totalQuantity: { $sum: '$quantity' },
        totalAmount: { $sum: '$amount' }
      }
    },
    
    // Add average price
    {
      $addFields: {
        avgPrice: { $divide: ['$totalAmount', '$totalQuantity'] }
      }
    },
    
    // Group by security
    {
      $group: {
        _id: {
          securityId: '$_id.securityId',
          securityName: '$_id.securityName'
        },
        dematAccounts: {
          $push: {
            accountLabel: '$_id.accountLabel',
            userAccountName: '$_id.userAccountName',
            brokerName: '$_id.brokerName',
            dematAccountId: '$_id.dematAccountId',
            holdings: '$holdings',
            total: {
              quantity: '$totalQuantity',
              price: '$avgPrice',
              amount: '$totalAmount'
            }
          }
        }
      }
    },
    
    // Sort demat accounts within each security
    {
      $addFields: {
        dematAccounts: {
          $sortArray: {
            input: '$dematAccounts',
            sortBy: { 
              userAccountName: 1, 
              brokerName: 1 
            }
          }
        }
      }
    },
    
    // Project final structure
    {
      $project: {
        _id: 0,
        securityId: '$_id.securityId',
        securityName: '$_id.securityName',
        dematAccounts: 1
      }
    },
    
    // Sort by security name
    { $sort: { securityName: 1 } }
  ]);

  return result;
}

const getLedgerRecords = async (dematAccountId, filters) => {
  const dematAccount = await DematAccount.findById(dematAccountId);
  if (!dematAccount) {
    const error = new Error('Demat Account not found');
    error.statusCode = 404;
    error.reasonCode = 'NOT_FOUND';
    throw error;
  }

  const { startDate, endDate } = filters;

  const matchQuery = { dematAccountId: dematAccount._id };
  
  if (startDate || endDate) {
    matchQuery.date = {};
    if (startDate) {
      matchQuery.date.$gte = new Date(startDate);
    }
    if (endDate) {
      matchQuery.date.$lte = new Date(endDate);
    }
  }

  const result = await LedgerEntry.aggregate([
    { $match: matchQuery },
    {
      $lookup: {
        from: 'transactions',
        localField: 'tradeTransactionId',
        foreignField: '_id',
        as: 'transaction'
      }
    },
    {
      $unwind: {
        path: '$transaction',
        preserveNullAndEmptyArrays: true
      }
    },
    {
      $addFields: {
        type: {
          $ifNull: [
            '$transaction.type',
            {
              $cond: {
                if: { $gt: ['$transactionAmount', 0] },
                then: 'CREDIT',
                else: 'DEBIT'
              }
            }
          ]
        }
      }
    },
    {
      $project: {
        date: 1,
        dematAccountId: 1,
        transactionAmount: 1,
        remarks: 1,
        tradeTransactionId: 1,
        type: 1,
        createdAt: 1,
        updatedAt: 1
      }
    },
    { $sort: { date: 1, createdAt: 1 } }
  ]);

  return result;
}


module.exports = {
  getPnLRecords,
  getHoldingsRecords,
  getLedgerRecords
};
