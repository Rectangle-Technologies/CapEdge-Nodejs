const brokerService = require('../services/brokerService');
const ApiResponse = require('../utils/response');

/**
 * Get all brokers with optional search and pagination
 * @route GET /broker/get-all
 */
const getBrokers = async (req, res, next) => {
  try {
    const result = await brokerService.getBrokers({ 
      name: req.query.name, 
      limit: req.query.limit ? parseInt(req.query.limit) : 50,
      pageNo: req.query.pageNo ? parseInt(req.query.pageNo) : 1
    });
    
    return ApiResponse.success(res, result, 'Brokers retrieved successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * Create a new broker
 * @route POST /broker/create
 */
const createBroker = async (req, res, next) => {
  try {
    const broker = await brokerService.createBroker(req.body);

    return ApiResponse.created(res, { broker }, 'Broker created successfully');
  } catch (error) {
    next(error);
  }
};

/**
 * Update an existing broker
 * @route PUT /broker/update/:id
 */
const updateBroker = async (req, res, next) => {
  try {
    const broker = await brokerService.updateBroker(req.params.id, req.body);

    return ApiResponse.success(res, { broker }, 'Broker updated successfully');
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

    return ApiResponse.success(res, null, 'Broker deleted successfully');
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