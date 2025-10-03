const { validationResult } = require('express-validator');
const userAccountService = require('../services/userAccountService');
const logger = require('../utils/logger');

const getUserAccounts = async (req, res, next) => {
  try {
    const filters = {
      name: req.query.name,
      includeDematAccounts: req.query.includeDematAccounts !== 'false',
      limit: req.query.limit,
      offset: req.query.offset
    };
    
    const result = await userAccountService.getUserAccounts(filters);
    
    res.json({
      success: true,
      data: result,
      message: 'User accounts retrieved successfully'
    });
  } catch (error) {
    next(error);
  }
};

const createUserAccount = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({
        success: false,
        errors: errors.array()
      });
    }

    const userAccount = await userAccountService.createUserAccount(req.body);
    
    res.status(201).json({
      success: true,
      data: { userAccount },
      message: 'User account created successfully'
    });
  } catch (error) {
    next(error);
  }
};

const updateUserAccount = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({
        success: false,
        errors: errors.array()
      });
    }

    const userAccount = await userAccountService.updateUserAccount(req.params.id, req.body);
    
    res.json({
      success: true,
      data: { userAccount },
      message: 'User account updated successfully'
    });
  } catch (error) {
    next(error);
  }
};

const deleteUserAccount = async (req, res, next) => {
  try {
    await userAccountService.deleteUserAccount(req.params.id);
    
    res.json({
      success: true,
      message: 'User account deleted successfully'
    });
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