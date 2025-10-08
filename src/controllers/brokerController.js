const { validationResult } = require('express-validator');
const brokerService = require('../services/brokerService');
const logger = require('../utils/logger');

/**
 * Get all brokers with optional search and pagination
 * @route GET /brokers
 */
const getBrokers = async (req, res, next) => {
  try {
    const result = await brokerService.getBrokers({ 
      name: req.query.name, 
      limit: req.query.limit ? parseInt(req.query.limit) : undefined,
      pageNo: req.query.pageNo ? parseInt(req.query.pageNo) : 1
    });
    
    res.json({
      success: true,
      data: result,
      message: 'Brokers retrieved successfully'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new broker
 * @route POST /brokers
 */
const createBroker = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const broker = await brokerService.createBroker(req.body);

    res.status(201).json({
      success: true,
      data: { broker },
      message: 'Broker created successfully'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update an existing broker
 * @route PUT /brokers/:id
 */
const updateBroker = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const broker = await brokerService.updateBroker(req.params.id, req.body);

    res.json({
      success: true,
      data: { broker },
      message: 'Broker updated successfully'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a broker
 * @route DELETE /brokers/:id
 */
const deleteBroker = async (req, res, next) => {
  try {
    await brokerService.deleteBroker(req.params.id);

    res.json({
      success: true,
      message: 'Broker deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getBrokers,
  createBroker,
  updateBroker,
  deleteBroker
};