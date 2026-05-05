const transactionService = require('../services/transactionService');
const contractUploadService = require('../services/contractUploadService');
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
      date: req.query.date,
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

const editContract = async (req, res, next) => {
  try {
    const { referenceNumber, dematAccountId, transactions } = req.body;
    const result = await transactionService.editContract(referenceNumber, dematAccountId, transactions);
    return ApiResponse.success(res, { transactions: result }, 'Contract updated successfully');
  } catch (error) {
    console.error('Error editing contract:', error);
    next(error);
  }
};

const deleteContract = async (req, res, next) => {
  try {
    const { referenceNumber, dematAccountId } = req.query;
    await transactionService.deleteContract(referenceNumber, dematAccountId);
    return ApiResponse.success(res, null, 'Contract deleted successfully');
  } catch (error) {
    console.error('Error deleting contract:', error);
    next(error);
  }
};

const uploadContract = async (req, res, next) => {
  try {
    if (!req.file || !req.file.buffer) {
      const e = new Error('PDF file is required');
      e.statusCode = 400;
      e.reasonCode = 'BAD_REQUEST';
      throw e;
    }
    const userAccountId = req.body.userAccountId || null;
    const result = await contractUploadService.previewContract(req.file.buffer, req.file.originalname, userAccountId);
    return ApiResponse.success(res, result, 'Contract parsed successfully');
  } catch (error) {
    console.error('Error parsing contract:', error);
    next(error);
  }
};

module.exports = {
  getTransactions,
  getContracts,
  createTransactions,
  deleteTransaction,
  editTransaction,
  editContract,
  deleteContract,
  uploadContract
};