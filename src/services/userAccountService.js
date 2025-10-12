const UserAccount = require('../models/UserAccount');
const DematAccount = require('../models/DematAccount');
const Transaction = require('../models/Transaction');

/**
 * User Account Service
 * Handles all business logic for user account management
 */

/**
 * Get all user accounts with optional filters and pagination
 * @param {Object} filters - { name, includeDematAccounts, limit, offset }
 * @returns {Promise<Object>} - { userAccounts, pagination }
 */
const getUserAccounts = async (filters = {}) => {
  const { name, includeDematAccounts, limit, pageNo = 1 } = filters;

  // Calculate offset from pageNo and limit
  const offset = (pageNo - 1) * limit;
  
  // Build query
  const query = {};
  if (name) {
    // Since name is already processed (lowercase, trimmed), we can use it directly for partial matching
    query.name = { $regex: name, $options: 'i' };
  }

  if (includeDematAccounts) {
    // Use aggregation pipeline for complex joins
    const pipeline = [
      { $match: query },
      {
        $lookup: {
          from: 'demataccounts',
          localField: '_id',
          foreignField: 'userAccountId',
          as: 'dematAccounts'
        }
      },
      {
        $lookup: {
          from: 'brokers',
          localField: 'dematAccounts.brokerId',
          foreignField: '_id',
          as: 'brokers'
        }
      },
      {
        $addFields: {
          dematAccounts: {
            $map: {
              input: '$dematAccounts',
              as: 'demat',
              in: {
                $mergeObjects: [
                  '$$demat',
                  {
                    broker: {
                      $arrayElemAt: [
                        {
                          $filter: {
                            input: '$brokers',
                            as: 'b',
                            cond: { $eq: ['$$b._id', '$$demat.brokerId'] }
                          }
                        },
                        0
                      ]
                    }
                  }
                ]
              }
            }
          }
        }
      },
      { $project: { brokers: 0 } },
      { $sort: { name: 1 } },
      { $skip: parseInt(offset) },
      { $limit: parseInt(limit) }
    ];

    const userAccounts = await UserAccount.aggregate(pipeline);
    const total = await UserAccount.countDocuments(query);

    return {
      userAccounts,
      pagination: {
        total,
        count: userAccounts.length,
        limit: parseInt(limit),
        pageNo: parseInt(pageNo)
      }
    };
  } else {
    // Simple query without demat accounts
    const total = await UserAccount.countDocuments(query);
    const userAccounts = await UserAccount.find(query)
      .sort({ name: 1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset))
      .lean();

    return {
      userAccounts,
      pagination: {
        total,
        count: userAccounts.length,
        limit: parseInt(limit),
        pageNo: parseInt(pageNo)
      }
    };
  }
};

/**
 * Create a new user account
 * @param {Object} userData - { name, panNumber, address }
 * @returns {Promise<Object>} - Created user account
 */
const createUserAccount = async (userData) => {
  const { name, panNumber, address } = userData;

  // Check if PAN already exists
  const existingUser = await UserAccount.findOne({ panNumber: panNumber.toUpperCase() });

  if (existingUser) {
    const error = new Error('User account with this PAN number already exists');
    error.statusCode = 409;
    error.reasonCode = 'ALREADY_EXISTS';
    throw error;
  }

  // Create user account
  const userAccount = new UserAccount({
    name,
    panNumber: panNumber.toUpperCase(),
    address
  });

  await userAccount.save();

  return userAccount;
};

/**
 * Update an existing user account
 * @param {String} userAccountId - User Account ID
 * @param {Object} updateData - { name, panNumber, address }
 * @returns {Promise<Object>} - Updated user account
 */
const updateUserAccount = async (userAccountId, updateData) => {
  const { name, address } = updateData;

  // Check if user account exists
  const userAccount = await UserAccount.findById(userAccountId);
  if (!userAccount) {
    const error = new Error('User account not found');
    error.statusCode = 404;
    error.reasonCode = 'NOT_FOUND';
    throw error;
  }

  // Update user account
  userAccount.name = name;
  userAccount.address = address;

  await userAccount.save();

  return userAccount;
};

/**
 * Delete a user account
 * @param {String} userAccountId - User Account ID
 * @returns {Promise<void>}
 */
const deleteUserAccount = async (userAccountId) => {
  // Check if user account exists
  const userAccount = await UserAccount.findById(userAccountId);
  if (!userAccount) {
    const error = new Error('User account not found');
    error.statusCode = 404;
    throw error;
  }

  // Check for dependent demat accounts
  const dematAccounts = await DematAccount.find({ userAccountId });
  if (dematAccounts.length > 0) {
    // Check if any demat account has transactions
    const dematAccountIds = dematAccounts.map(acc => acc._id);
    const transactionCount = await Transaction.countDocuments({
      dematAccountId: { $in: dematAccountIds }
    });

    if (transactionCount > 0) {
      const error = new Error('Cannot delete user account with associated transactions');
      error.statusCode = 400;
      throw error;
    }

    const error = new Error('Cannot delete user account with associated demat accounts');
    error.statusCode = 400;
    throw error;
  }

  // Delete user account
  await UserAccount.findByIdAndDelete(userAccountId);
};

module.exports = {
  getUserAccounts,
  createUserAccount,
  updateUserAccount,
  deleteUserAccount
};
