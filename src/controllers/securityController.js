const { validationResult } = require('express-validator');
const securityService = require('../services/securityService');
const logger = require('../utils/logger');

const getSecurities = async (req, res, next) => {
  try {
    const filters = {
      name: req.query.name,
      type: req.query.type,
      exchangeId: req.query.exchangeId,
      limit: req.query.limit ? parseInt(req.query.limit) : undefined,
      pageNo: req.query.pageNo ? parseInt(req.query.pageNo) : 1
    };
    
    const result = await securityService.getSecurities(filters);
    
    res.json({
      success: true,
      data: result,
      message: 'Securities retrieved successfully'
    });
  } catch (error) {
    next(error);
  }
};

const createSecurity = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({
        success: false,
        errors: errors.array()
      });
    }

    console.log('Request body for creating security:', req.body);

    const security = await securityService.createSecurity(req.body);
    
    res.status(201).json({
      success: true,
      data: { security },
      message: 'Security created successfully'
    });
  } catch (error) {
    next(error);
  }
};

const bulkCreateSecurities = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({
        success: false,
        errors: errors.array()
      });
    }

    // Validate that body is an array
    if (!Array.isArray(req.body)) {
      return res.status(400).json({
        success: false,
        message: 'Request body must be an array of securities'
      });
    }

    if (req.body.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Array cannot be empty'
      });
    }

    const result = await securityService.bulkCreateSecurities(req.body);
    
    // Determine status code based on results
    const statusCode = result.summary.failed > 0 ? 207 : 201; // 207 Multi-Status if partial success
    
    res.status(statusCode).json({
      success: result.summary.failed === 0,
      data: result,
      message: `Bulk upload completed: ${result.summary.successful} successful, ${result.summary.failed} failed`
    });
  } catch (error) {
    next(error);
  }
};

const updateSecurity = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({
        success: false,
        errors: errors.array()
      });
    }

    const security = await securityService.updateSecurity(req.params.id, req.body);
    
    res.json({
      success: true,
      data: { security },
      message: 'Security updated successfully'
    });
  } catch (error) {
    next(error);
  }
};

const deleteSecurity = async (req, res, next) => {
  try {
    await securityService.deleteSecurity(req.params.id);
    
    res.json({
      success: true,
      message: 'Security deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getSecurities,
  createSecurity,
  bulkCreateSecurities,
  updateSecurity,
  deleteSecurity
};