const Holdings = require('../models/Holdings');
const FinancialYear = require('../models/FinancialYear');
const Security = require('../models/Security');
const DematAccount = require('../models/DematAccount');
const Transaction = require('../models/Transaction');

/**
 * Holdings Service
 * Handles all business logic for holdings management
 */

/**
 * Get holdings from the Holdings collection (current/latest financial year)
 * @param {Object} query - MongoDB query object
 * @param {Object} options - Pagination options
 * @returns {Promise<Object>} - { holdings, total }
 */
const getHoldingsFromCollection = async (query, options) => {
  const total = await Holdings.countDocuments(query);

  const holdings = await Holdings.find(query, null, options)
    .populate('securityId')
    .populate({
      path: 'dematAccountId',
      populate: {
        path: 'brokerId'
      }
    })
    .populate('transactionId')
    .populate('financialYearId', 'title')
    .lean();

  return { holdings, total };
};

/**
 * Get holdings from FinancialYear report (historical financial years)
 * @param {String} financialYearId - The financial year ID to fetch from
 * @param {Object} query - Filter criteria
 * @param {Object} options - Pagination options
 * @param {Array} dematAccountIds - Array of demat account IDs to filter by (for userAccountId filter)
 * @returns {Promise<Object>} - { holdings, total }
 */
const getHoldingsFromReport = async (financialYearId, query, options, dematAccountIds = []) => {
  // Fetch the financial year with its reports
  const financialYear = await FinancialYear.findById(financialYearId).lean();
  
  if (!financialYear || !financialYear.reports) {
    return { holdings: [], total: 0 };
  }

  let allHoldings = [];

  // Determine which demat accounts to fetch holdings from
  let targetDematAccountIds = [];
  
  if (query.dematAccountId) {
    // Single demat account filter
    const dematId = query.dematAccountId.toString();
    targetDematAccountIds = [dematId];
  } else if (dematAccountIds.length > 0) {
    // Multiple demat accounts from userAccountId filter
    targetDematAccountIds = dematAccountIds.map(id => id.toString());
  }
  // If no dematAccountId filter and no dematAccountIds, targetDematAccountIds remains empty

  // Collect holdings from the reports map for each target demat account
  for (const dematId of targetDematAccountIds) {
    // When using .lean(), the Map becomes a plain object, so access it as an object property
    const report = financialYear.reports[dematId];
    if (report && report.holdings) {
      // Add dematAccountId to each holding for filtering and reference
      const holdingsWithDemat = report.holdings.map(h => ({
        ...h,
        dematAccountId: dematId,
        financialYearId: financialYearId
      }));
      allHoldings = allHoldings.concat(holdingsWithDemat);
    }
  }

  // Apply securityId filter if provided
  if (query.securityId) {
    const securityIdStr = query.securityId.toString();
    allHoldings = allHoldings.filter(h => h.securityId && h.securityId.toString() === securityIdStr);
  }

  const total = allHoldings.length;

  // Sort by buyDate
  allHoldings.sort((a, b) => new Date(a.buyDate) - new Date(b.buyDate));

  // Apply pagination
  const skip = options.skip || 0;
  const limit = options.limit || allHoldings.length;
  const paginatedHoldings = allHoldings.slice(skip, skip + limit);

  // Populate references for the paginated holdings
  const securityIds = [...new Set(paginatedHoldings.map(h => h.securityId).filter(Boolean))];
  const dematIds = [...new Set(paginatedHoldings.map(h => h.dematAccountId).filter(Boolean))];
  const transactionIds = [...new Set(paginatedHoldings.map(h => h.transactionId).filter(Boolean))];

  const [securities, dematAccounts, transactions] = await Promise.all([
    Security.find({ _id: { $in: securityIds } }).lean(),
    DematAccount.find({ _id: { $in: dematIds } }).populate('brokerId').lean(),
    Transaction.find({ _id: { $in: transactionIds } }).lean()
  ]);

  // Create lookup maps
  const securityMap = new Map(securities.map(s => [s._id.toString(), s]));
  const dematMap = new Map(dematAccounts.map(d => [d._id.toString(), d]));
  const transactionMap = new Map(transactions.map(t => [t._id.toString(), t]));

  // Populate the holdings
  const populatedHoldings = paginatedHoldings.map(h => ({
    ...h,
    securityId: h.securityId ? securityMap.get(h.securityId.toString()) || h.securityId : null,
    dematAccountId: h.dematAccountId ? dematMap.get(h.dematAccountId.toString()) || h.dematAccountId : null,
    transactionId: h.transactionId ? transactionMap.get(h.transactionId.toString()) || h.transactionId : null,
    financialYearId: { _id: financialYear._id, title: financialYear.title }
  }));

  return { holdings: populatedHoldings, total };
};

/**
 * Get all holdings with optional filters and pagination
 * @param {Object} filters - { securityId, dematAccountId, userAccountId, limit, pageNo, financialYearId }
 * @returns {Promise<Object>} - { holdings, pagination }
 */
const getHoldings = async (filters = {}) => {
  const { securityId, dematAccountId, userAccountId, limit, pageNo = 1, financialYearId } = filters;
  
  // Build query
  const query = {};
  
  if (securityId) {
    query.securityId = securityId;
  }
  
  if (dematAccountId) {
    query.dematAccountId = dematAccountId;
  }
  
  // If userAccountId is provided, we need to find all demat accounts for that user
  let dematAccountIds = [];
  if (userAccountId) {
    const dematAccounts = await DematAccount.find({ userAccountId }).select('_id').lean();
    dematAccountIds = dematAccounts.map(da => da._id);
    
    // Add to query - if dematAccountId filter is also provided, we need to intersect
    if (query.dematAccountId) {
      // Check if the provided dematAccountId belongs to the userAccountId
      const belongsToUser = dematAccountIds.some(id => id.toString() === query.dematAccountId.toString());
      if (!belongsToUser) {
        // Return empty result if dematAccountId doesn't belong to user
        return {
          holdings: [],
          pagination: {
            total: 0,
            count: 0,
            limit: limit ? parseInt(limit) : 0,
            pageNo: parseInt(pageNo)
          }
        };
      }
    } else {
      // Use the demat accounts from userAccountId
      query.dematAccountId = { $in: dematAccountIds };
    }
  }

  // Build options for pagination
  const options = {
    sort: { buyDate: 1 },
    skip: limit ? (pageNo - 1) * limit : 0,
    limit: limit ? parseInt(limit) : 0
  };

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

  let holdings, total;

  if (shouldFetchFromCollection) {
    // Fetch from Holdings collection (current behavior)
    const result = await getHoldingsFromCollection(query, options);
    holdings = result.holdings;
    total = result.total;
  } else {
    // Fetch from FinancialYear report (historical data)
    const result = await getHoldingsFromReport(financialYearId, query, options, dematAccountIds);
    holdings = result.holdings;
    total = result.total;
  }

  return {
    holdings,
    pagination: {
      total,
      count: holdings.length,
      limit: limit ? parseInt(limit) : total,
      pageNo: parseInt(pageNo)
    }
  };
};

const getHoldingsForSplit = async (securityId) => {
  // Check if security exists
  const security = await Security.findById(securityId);
  if (!security) {
    throw new Error('Security not found');
  }

  const query = { securityId };

  const holdings = await Holdings.find(query)
    .populate('securityId')
    .populate({
      path: 'dematAccountId',
      populate: [
        { path: 'brokerId' },
        { path: 'userAccountId' }
      ]
    })
    .sort({ buyDate: 1 })
    .lean();

  // Group by dematAccountId
  const groupedHoldings = holdings.reduce((acc, holding) => {
    const dematId = holding.dematAccountId?._id?.toString();
    if (!acc[dematId]) {
      acc[dematId] = [];
    }
    acc[dematId].push(holding);
    return acc;
  }, {});

  // Transform to array format with title and entries
  const response = Object.values(groupedHoldings).map(dematHoldings => {
    const firstHolding = dematHoldings[0];
    const userName = firstHolding.dematAccountId?.userAccountId?.name || 'Unknown User';
    const brokerName = firstHolding.dematAccountId?.brokerId?.name || 'Unknown Broker';
    
    return {
      title: `${userName} - ${brokerName}`,
      entries: dematHoldings.map(holding => ({
        buyDate: holding.buyDate,
        price: holding.price,
        quantity: holding.quantity,
        transactionId: holding.transactionId
      }))
    };
  });

  return {
    securityName: security.name,
    holdings: response
  };
}

module.exports = {
  getHoldings,
  getHoldingsForSplit
};
