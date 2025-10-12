const Broker = require('../models/Broker');
const DematAccount = require('../models/DematAccount');

/**
 * Broker Service
 * Handles all business logic for broker management
 */

/**
 * Get all brokers with optional search and pagination
 * @param {Object} filters - { name, limit, pageNo }
 * @returns {Promise<Object>} - { brokers, pagination }
 */
const getBrokers = async (filters = {}) => {
  const { name, limit, pageNo = 1 } = filters;
  
  // Calculate offset from pageNo and limit
  const offset = (pageNo - 1) * limit;
  
  // Build query
  const query = {};
  if (name) {
    query.name = { $regex: name, $options: 'i' }; // Case-insensitive search
  }

  // Get total count for pagination
  const total = await Broker.countDocuments(query);

  // Fetch brokers with pagination
  const brokers = await Broker.find(query)
    .sort({ name: 1 })
    .limit(parseInt(limit))
    .skip(parseInt(offset))
    .lean();

  return {
    brokers,
    pagination: {
      total,
      count: brokers.length,
      limit: parseInt(limit),
      pageNo: parseInt(pageNo)
    }
  };
};

/**
 * Create a new broker
 * @param {Object} brokerData - { name, panNumber, address }
 * @returns {Promise<Object>} - Created broker
 */
const createBroker = async (brokerData) => {
  const { name, panNumber, address } = brokerData;

  // Check if PAN already exists
  const existingBroker = await Broker.findOne({ 
    panNumber: panNumber.toUpperCase() 
  });
  
  if (existingBroker) {
    const error = new Error('Broker with this PAN number already exists');
    error.statusCode = 400;
    error.reasonCode = 'ALREADY_EXISTS';
    throw error;
  }

  // Create broker
  const broker = new Broker({
    name,
    panNumber: panNumber.toUpperCase(),
    address
  });

  await broker.save();

  return broker;
};

/**
 * Update an existing broker
 * @param {String} brokerId - Broker ID
 * @param {Object} updateData - { name, panNumber, address }
 * @returns {Promise<Object>} - Updated broker
 */
const updateBroker = async (brokerId, updateData) => {
  const { name, address } = updateData;

  // Check if broker exists
  const broker = await Broker.findById(brokerId);
  if (!broker) {
    const error = new Error('Broker not found');
    error.statusCode = 404;
    error.reasonCode = 'NOT_FOUND';
    throw error;
  }

  // Update broker
  broker.name = name;
  broker.address = address;

  await broker.save();

  return broker;
};

/**
 * Delete a broker
 * @param {String} brokerId - Broker ID
 * @returns {Promise<void>}
 */
const deleteBroker = async (brokerId) => {
  // Check if broker exists
  const broker = await Broker.findById(brokerId);
  if (!broker) {
    const error = new Error('Broker not found');
    error.statusCode = 404;
    throw error;
  }

  // Check for dependent demat accounts
  const accountCount = await DematAccount.countDocuments({ brokerId });
  if (accountCount > 0) {
    const error = new Error('Cannot delete broker with associated demat accounts');
    error.statusCode = 400;
    throw error;
  }

  // Delete broker
  await Broker.findByIdAndDelete(brokerId);
};

module.exports = {
  getBrokers,
  createBroker,
  updateBroker,
  deleteBroker
};
