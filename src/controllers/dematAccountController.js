const { validationResult } = require('express-validator');
const dematAccountService = require('../services/dematAccountService');
const logger = require('../utils/logger');

const getDematAccounts = async (req, res, next) => {
  try {
    const filters = {
      userAccountId: req.query.userAccountId,
      brokerId: req.query.brokerId,
      limit: req.query.limit,
      offset: req.query.offset
    };
    
    const result = await dematAccountService.getDematAccounts(filters);
    
    res.json({
      success: true,
      data: result,
      message: 'Demat accounts retrieved successfully'
    });
  } catch (error) {
    next(error);
  }
};

const createDematAccount = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({
        success: false,
        errors: errors.array()
      });
    }

    const dematAccount = await dematAccountService.createDematAccount(req.body);
    
    res.status(201).json({
      success: true,
      data: { dematAccount },
      message: 'Demat account created successfully'
    });
  } catch (error) {
    next(error);
  }
};

const updateDematAccount = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({
        success: false,
        errors: errors.array()
      });
    }

    const dematAccount = await dematAccountService.updateDematAccount(req.params.id, req.body);
    
    res.json({
      success: true,
      data: { dematAccount },
      message: 'Demat account updated successfully'
    });
  } catch (error) {
    next(error);
  }
};

const deleteDematAccount = async (req, res, next) => {
  try {
    await dematAccountService.deleteDematAccount(req.params.id);
    
    res.json({
      success: true,
      message: 'Demat account deleted successfully'
    });
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