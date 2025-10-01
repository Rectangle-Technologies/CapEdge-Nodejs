const { validationResult } = require('express-validator');
const transactionService = require('../services/transactionService');
const logger = require('../utils/logger');

const getTransactions = async (req, res, next) => {
  try {
    const filters = {
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      type: req.query.type,
      securityId: req.query.securityId,
      dematAccountId: req.query.dematAccountId,
      deliveryType: req.query.deliveryType,
      limit: req.query.limit,
      offset: req.query.offset
    };
    
    const result = await transactionService.getTransactions(filters);
    
    res.json({
      success: true,
      data: result,
      message: 'Transactions retrieved successfully'
    });
  } catch (error) {
    next(error);
  }
};

const createTransaction = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({
        success: false,
        errors: errors.array()
      });
    }

    const transaction = await transactionService.createTransaction(req.body);
    
    res.status(201).json({
      success: true,
      data: { transaction },
      message: 'Transaction created successfully'
    });
  } catch (error) {
    next(error);
  }
};

const updateTransaction = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({
        success: false,
        errors: errors.array()
      });
    }

    const transaction = await transactionService.updateTransaction(req.params.id, req.body);
    
    res.json({
      success: true,
      data: { transaction },
      message: 'Transaction updated successfully'
    });
  } catch (error) {
    next(error);
  }
};

const deleteTransaction = async (req, res, next) => {
  try {
    await transactionService.deleteTransaction(req.params.id);
    
    res.json({
      success: true,
      message: 'Transaction deleted successfully'
    });
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