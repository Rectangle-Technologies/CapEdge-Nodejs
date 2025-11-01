const financialYearService = require('../services/financialYearService');
const ApiResponse = require('../utils/response');

const getFinancialYears = async (req, res, next) => {
  try {
    const filters = req.query;

    const financialYears = await financialYearService.getFinancialYears(filters);

    return ApiResponse.success(res, { financialYears }, 'Financial years retrieved successfully');
  } catch (error) {
    next(error);
  }
}

const createFinancialYear = async (req, res, next) => {
  try {
    const financialYear = await financialYearService.createFinancialYear(req.body);

    return ApiResponse.created(res, { financialYear }, 'Financial year created successfully');
  } catch (error) {
    next(error);
  }
};

const updateFinancialYear = async (req, res, next) => {
  try {
    const financialYear = await financialYearService.updateFinancialYear(req.params.id, req.body);

    return ApiResponse.success(res, { financialYear }, 'Financial year updated successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getFinancialYears,
  createFinancialYear,
  updateFinancialYear
};