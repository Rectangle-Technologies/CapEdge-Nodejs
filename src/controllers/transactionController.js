const transactionService = require('../services/transactionService');
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
      pageNo: req.query.pageNo ? parseInt(req.query.pageNo) : 1,
      financialYearId: req.query.financialYearId
    };
    
    const result = await transactionService.getTransactions(filters);
    
    return ApiResponse.success(res, result, 'Transactions retrieved successfully');
  } catch (error) {
    next(error);
  }
};

const createTransactions = async (req, res, next) => {
  try {
    const transactions = await transactionService.createTransactions(req.body);

    return ApiResponse.created(res, { transactions }, 'Transactions created successfully');
  } catch (error) {
    console.error('Error creating transactions:', error);
    next(error);
  }
};

const getContracts = async (req, res, next) => {
  try {
    const filters = {
      dematAccountId: req.query.dematAccountId,
      securityId: req.query.securityId,
      financialYearId: req.query.financialYearId,
      referenceNumber: req.query.referenceNumber,
      limit: req.query.limit ? parseInt(req.query.limit) : undefined,
      pageNo: req.query.pageNo ? parseInt(req.query.pageNo) : 1
    };

    const result = await transactionService.getContracts(filters);

    return ApiResponse.success(res, result, 'Contracts retrieved successfully');
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

const editTransaction = async (req, res, next) => {
  try {
    const transactions = await transactionService.editTransaction(req.params.id, req.body);
    return ApiResponse.success(res, { transactions }, 'Transaction updated successfully');
  } catch (error) {
    console.error('Error editing transaction:', error);
    next(error);
  }
};

module.exports = {
  getTransactions,
  getContracts,
  createTransactions,
  deleteTransaction,
  editTransaction
};