const { validationResult } = require('express-validator');
const userAccountService = require('../services/userAccountService');

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