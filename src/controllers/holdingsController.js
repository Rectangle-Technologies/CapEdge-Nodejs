const holdingsService = require('../services/holdingsService');
const ApiResponse = require('../utils/response');

/**
 * Get all holdings with optional filters
 * Query params: securityId, dematAccountId, userAccountId, limit, pageNo
 */
const getHoldings = async (req, res, next) => {
  try {
    const filters = {
      securityId: req.query.securityId,
      dematAccountId: req.query.dematAccountId,
      userAccountId: req.query.userAccountId,
      financialYearId: req.query.financialYearId,
      limit: req.query.limit ? parseInt(req.query.limit) : undefined,
      pageNo: req.query.pageNo ? parseInt(req.query.pageNo) : 1
    };
    
    const result = await holdingsService.getHoldings(filters);
    
    return ApiResponse.success(res, result, 'Holdings retrieved successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getHoldings
};
