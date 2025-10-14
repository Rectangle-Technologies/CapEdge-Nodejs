const { validationResult } = require('express-validator');
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
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const error = new Error(errors.array()[0].msg);
      error.statusCode = 422;
      error.reasonCode = 'BAD_REQUEST';
      error.field = errors.array()[0].path;
      throw error;
    }

    const financialYear = await financialYearService.createFinancialYear(req.body);

    return ApiResponse.created(res, { financialYear }, 'Financial year created successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getFinancialYears,
  createFinancialYear
};