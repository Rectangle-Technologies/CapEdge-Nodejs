const Holdings = require('../models/Holdings');

/**
 * Holdings Service
 * Handles all business logic for holdings management
 */

/**
 * Get all holdings with optional filters and pagination
 * @param {Object} filters - { securityId, dematAccountId, userAccountId, limit, pageNo }
 * @returns {Promise<Object>} - { holdings, pagination }
 */
const getHoldings = async (filters = {}) => {
  const { securityId, dematAccountId, userAccountId, limit, pageNo = 1 } = filters;
  
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
    const DematAccount = require('../models/DematAccount');
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

  // Get total count
  const total = await Holdings.countDocuments(query);

  // Build options for pagination
  const options = {
    sort: { buyDate: 1 },
    skip: limit ? (pageNo - 1) * limit : 0,
    limit: limit ? parseInt(limit) : 0
  };

  // Fetch holdings with populated references
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

module.exports = {
  getHoldings
};
