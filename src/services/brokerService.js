const Broker = require('../models/Broker');
const DematAccount = require('../models/DematAccount');
const logger = require('../utils/logger');

/**
 * Broker Service
 * Handles all business logic for broker management
 */

/**
 * Get all brokers with optional search and pagination
 * @param {Object} filters - { name, limit, offset }
 * @returns {Promise<Object>} - { brokers, pagination }
 */
const getBrokers = async (filters = {}) => {
  try {
    const { name, limit = 50, offset = 0 } = filters;
    
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
        offset: parseInt(offset)
      }
    };
  } catch (error) {
    logger.error('Error in getBrokers service:', error);
    throw error;
  }
};

/**
 * Create a new broker
 * @param {Object} brokerData - { name, panNumber, address }
 * @returns {Promise<Object>} - Created broker
 */
const createBroker = async (brokerData) => {
  try {
    const { name, panNumber, address } = brokerData;

    // Check if PAN already exists
    const existingBroker = await Broker.findOne({ 
      panNumber: panNumber.toUpperCase() 
    });
    
    if (existingBroker) {
      const error = new Error('Broker with this PAN number already exists');
      error.statusCode = 400;
      throw error;
    }

    // Create broker
    const broker = new Broker({
      name,
      panNumber: panNumber.toUpperCase(),
      address
    });

    await broker.save();
    logger.info(`Broker created: ${broker._id}`);

    return broker;
  } catch (error) {
    logger.error('Error in createBroker service:', error);
    throw error;
  }
};

/**
 * Update an existing broker
 * @param {String} brokerId - Broker ID
 * @param {Object} updateData - { name, panNumber, address }
 * @returns {Promise<Object>} - Updated broker
 */
const updateBroker = async (brokerId, updateData) => {
  try {
    const { name, panNumber, address } = updateData;

    // Check if broker exists
    const broker = await Broker.findById(brokerId);
    if (!broker) {
      const error = new Error('Broker not found');
      error.statusCode = 404;
      throw error;
    }

    // Check if PAN is being changed and if it's unique
    if (panNumber && panNumber.toUpperCase() !== broker.panNumber) {
      const existingBroker = await Broker.findOne({ 
        panNumber: panNumber.toUpperCase(),
        _id: { $ne: brokerId }
      });
      
      if (existingBroker) {
        const error = new Error('Another broker with this PAN number already exists');
        error.statusCode = 400;
        throw error;
      }
    }

    // Update broker
    broker.name = name;
    broker.panNumber = panNumber.toUpperCase();
    broker.address = address;

    await broker.save();
    logger.info(`Broker updated: ${broker._id}`);

    return broker;
  } catch (error) {
    logger.error('Error in updateBroker service:', error);
    throw error;
  }
};

/**
 * Delete a broker
 * @param {String} brokerId - Broker ID
 * @returns {Promise<void>}
 */
const deleteBroker = async (brokerId) => {
  try {
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
    logger.info(`Broker deleted: ${brokerId}`);
  } catch (error) {
    logger.error('Error in deleteBroker service:', error);
    throw error;
  }
};

module.exports = {
  getBrokers,
  createBroker,
  updateBroker,
  deleteBroker
};
