const { validationResult } = require('express-validator');
const transactionService = require('../services/transactionService');
const logger = require('../utils/logger');
const ApiResponse = require('../utils/response');

const getTransactions = async (req, res, next) => {
  try {
    const filters = {
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      type: req.query.type,
      securityId: req.query.securityId,
      dematAccountId: req.query.dematAccountId,
      deliveryType: req.query.deliveryType,
      limit: req.query.limit ? parseInt(req.query.limit) : undefined,
      pageNo: req.query.pageNo ? parseInt(req.query.pageNo) : 1
    };
    
    const result = await transactionService.getTransactions(filters);
    
    return ApiResponse.success(res, result, 'Transactions retrieved successfully');
  } catch (error) {
    next(error);
  }
};

const createTransaction = async (req, res, next) => {
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

    const transaction = await transactionService.createTransactions(req.body);
    
    return ApiResponse.created(res, { transaction }, 'Transaction created successfully');
  } catch (error) {
    console.error('Error creating transaction:', error);
    next(error);
  }
};

const updateTransaction = async (req, res, next) => {
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

    const transaction = await transactionService.updateTransaction(req.params.id, req.body);
    
    return ApiResponse.success(res, { transaction }, 'Transaction updated successfully');
  } catch (error) {
    next(error);
  }
};

const deleteTransaction = async (req, res, next) => {
  try {
    await transactionService.deleteTransaction(req.params.id);
    
    return ApiResponse.success(res, null, 'Transaction deleted successfully');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getTransactions,
  createTransaction,
  updateTransaction,
  deleteTransaction
};