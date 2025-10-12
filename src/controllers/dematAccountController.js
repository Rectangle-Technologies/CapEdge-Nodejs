const { validationResult } = require('express-validator');
const dematAccountService = require('../services/dematAccountService');
const ApiResponse = require('../utils/response');

const getDematAccounts = async (req, res, next) => {
  if (!req.query.userAccountId && !req.query.brokerId) {
    const error = new Error('At least one filter (userAccountId or brokerId) must be provided');
    error.statusCode = 422;
    error.reasonCode = 'BAD_REQUEST';
    throw error;
  }
  try {
    const filters = {
      userAccountId: req.query.userAccountId,
      brokerId: req.query.brokerId,
      limit: req.query.limit ? parseInt(req.query.limit) : undefined,
      pageNo: req.query.pageNo ? parseInt(req.query.pageNo) : 1
    };
    
    const result = await dematAccountService.getDematAccounts(filters);
    
    return ApiResponse.success(res, result, 'Demat accounts retrieved successfully');
  } catch (error) {
    next(error);
  }
};

const createDematAccount = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const error = new Error(errors.array()[0].msg);
      error.statusCode = 422;
      error.reasonCode = 'BAD_REQUEST';
      error.field = errors.array()[0].path;
      throw error;
    }

    const dematAccount = await dematAccountService.createDematAccount(req.body);
    
    return ApiResponse.created(res, { dematAccount }, 'Demat account created successfully');
  } catch (error) {
    next(error);
  }
};

const updateDematAccount = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const error = new Error(errors.array()[0].msg);
      error.statusCode = 422;
      error.reasonCode = 'BAD_REQUEST';
      error.field = errors.array()[0].path;
      throw error;
    }

    const dematAccount = await dematAccountService.updateDematAccount(req.params.id, req.body);
    
    return ApiResponse.success(res, { dematAccount }, 'Demat account updated successfully');
  } catch (error) {
    next(error);
  }
};

const deleteDematAccount = async (req, res, next) => {
  try {
    await dematAccountService.deleteDematAccount(req.params.id);
    
    return ApiResponse.success(res, null, 'Demat account deleted successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDematAccounts,
  createDematAccount,
  updateDematAccount,
  deleteDematAccount
};