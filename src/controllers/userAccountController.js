const { validationResult } = require('express-validator');
const userAccountService = require('../services/userAccountService');
const ApiResponse = require('../utils/response');

const getUserAccounts = async (req, res, next) => {
  try {
    // Process name for partial search (trim and normalize whitespace)
    const processedName = req.query.name 
      ? req.query.name.trim().replace(/\s+/g, ' ')
      : undefined;

    const filters = {
      name: processedName,
      includeDematAccounts: req.query.includeDematAccounts === 'true',
      limit: req.query.limit ? parseInt(req.query.limit) : undefined,
      pageNo: req.query.pageNo ? parseInt(req.query.pageNo) : 1
    };
    
    const result = await userAccountService.getUserAccounts(filters);
    
    return ApiResponse.success(res, result, 'User accounts retrieved successfully');
  } catch (error) {
    next(error);
  }
};

const createUserAccount = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const error = new Error(errors.array()[0].msg);
      error.statusCode = 422;
      error.reasonCode = 'BAD_REQUEST';
      error.field = errors.array()[0].path;
      error.errors = errors.array();
      throw error;
    }

    const userAccount = await userAccountService.createUserAccount(req.body);
    
    return ApiResponse.created(res, { userAccount }, 'User account created successfully');
  } catch (error) {
    next(error);
  }
};

const updateUserAccount = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const error = new Error(errors.array()[0].msg);
      error.statusCode = 422;
      error.reasonCode = 'BAD_REQUEST';
      error.field = errors.array()[0].path;
      error.errors = errors.array();
      throw error;
    }

    const userAccount = await userAccountService.updateUserAccount(req.params.id, req.body);
    
    return ApiResponse.success(res, { userAccount }, 'User account updated successfully');
  } catch (error) {
    next(error);
  }
};

const deleteUserAccount = async (req, res, next) => {
  try {
    await userAccountService.deleteUserAccount(req.params.id);
    
    return ApiResponse.success(res, null, 'User account deleted successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getUserAccounts,
  createUserAccount,
  updateUserAccount,
  deleteUserAccount
};