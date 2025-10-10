const { validationResult } = require('express-validator');
const securityService = require('../services/securityService');
const logger = require('../utils/logger');
const ApiResponse = require('../utils/response');

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
    
    return ApiResponse.success(res, result, 'Securities retrieved successfully');
  } catch (error) {
    next(error);
  }
};

const createSecurity = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return ApiResponse.validationError(res, 'Validation failed', null, errors.array());
    }

    console.log('Request body for creating security:', req.body);

    const security = await securityService.createSecurity(req.body);
    
    return ApiResponse.created(res, { security }, 'Security created successfully');
  } catch (error) {
    next(error);
  }
};

const bulkCreateSecurities = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return ApiResponse.validationError(res, 'Validation failed', null, errors.array());
    }

    // Validate that body is an array
    if (!Array.isArray(req.body)) {
      return ApiResponse.badRequest(res, 'Request body must be an array of securities');
    }

    if (req.body.length === 0) {
      return ApiResponse.badRequest(res, 'Array cannot be empty');
    }

    const result = await securityService.bulkCreateSecurities(req.body);
    
    // Determine status code based on results
    const statusCode = result.summary.failed > 0 ? 207 : 201; // 207 Multi-Status if partial success
    const success = result.summary.failed === 0;
    const message = `Bulk upload completed: ${result.summary.successful} successful, ${result.summary.failed} failed`;
    
    return ApiResponse.success(res, result, message, statusCode);
  } catch (error) {
    next(error);
  }
};

const updateSecurity = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return ApiResponse.validationError(res, 'Validation failed', null, errors.array());
    }

    const security = await securityService.updateSecurity(req.params.id, req.body);
    
    return ApiResponse.success(res, { security }, 'Security updated successfully');
  } catch (error) {
    next(error);
  }
};

const deleteSecurity = async (req, res, next) => {
  try {
    await securityService.deleteSecurity(req.params.id);
    
    return ApiResponse.success(res, null, 'Security deleted successfully');
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