const DematAccount = require('../models/DematAccount');
const LedgerEntry = require('../models/LedgerEntry');

/**
 * Ledger Service
 * Handles all business logic for ledger management
 */

/**
 * Get ledger entries with filters
 * @param {Object} filters - { startDate, endDate, dematAccountId, transactionType, limit, pageNo }
 * @returns {Promise<Object>} - { entries, pagination }
 */
const getLedgerEntries = async (filters = {}) => {
  const { startDate, endDate, dematAccountId, transactionType, limit = 50, pageNo = 1 } = filters;

  // Build match query
  const matchQuery = {};

  if (startDate || endDate) {
    matchQuery.date = {};
    if (startDate) matchQuery.date.$gte = new Date(startDate);
    if (endDate) matchQuery.date.$lte = new Date(endDate);
  }

  const dematAccount = await DematAccount.findById(dematAccountId);
  if (!dematAccount) {
    const error = new Error('Demat account not found');
    error.statusCode = 404;
    error.reasonCode = 'NOT_FOUND';
    throw error;
  }
  matchQuery.dematAccountId = dematAccount._id;

  // Calculate offset for pagination
  const offset = (pageNo - 1) * limit;

  // Aggregation pipeline for ledger entries
  const pipeline = [
    { $match: matchQuery },
    {
      $lookup: {
        from: 'transactions',
        localField: 'tradeTransactionId',
        foreignField: '_id',
        as: 'transaction'
      }
    },
    {
      $unwind: {
        path: '$transaction',
        preserveNullAndEmptyArrays: true
      }
    },
    {
      $lookup: {
        from: 'securities',
        localField: 'transaction.securityId',
        foreignField: '_id',
        as: 'security'
      }
    },
    {
      $unwind: {
        path: '$security',
        preserveNullAndEmptyArrays: true
      }
    },
    {
      $addFields: {
        type: {
          $ifNull: [
            '$transaction.type',
            {
              $cond: {
                if: { $gt: ['$transactionAmount', 0] },
                then: 'CREDIT',
                else: 'DEBIT'
              }
            }
          ]
        }
      }
    }
  ];

  // Add transaction type filter if provided
  if (transactionType) {
    if (transactionType === 'BUY') {
      pipeline.push({
        $match: {
          type: 'BUY'
        }
      });
    } else if (transactionType === 'SELL') {
      pipeline.push({
        $match: {
          type: 'SELL'
        }
      });
    } else if (transactionType === 'CREDIT') {
      pipeline.push({
        $match: {
          type: 'CREDIT'
        }
      });
    } else if (transactionType === 'DEBIT') {
      pipeline.push({
        $match: {
          type: 'DEBIT'
        }
      });
    }
  }

  // Sort by date (newest to oldest)
  pipeline.push({
    $sort: { date: -1 }
  });

  // Project final fields
  pipeline.push({
    $project: {
      date: 1,
      type: 1,
      transactionAmount: 1,
      tradeTransactionId: {
        $cond: [
          { $ne: ['$tradeTransactionId', null] },
          {
            _id: '$transaction._id',
            securityName: '$security.name',
            quantity: '$transaction.quantity',
            price: '$transaction.price'
          },
          null
        ]
      }
    }
  });

  // Get total count
  const countPipeline = [...pipeline, { $count: 'total' }];
  const countResult = await LedgerEntry.aggregate(countPipeline);
  const total = countResult.length > 0 ? countResult[0].total : 0;

  // Add pagination
  pipeline.push({ $skip: parseInt(offset) });
  pipeline.push({ $limit: parseInt(limit) });

  // Execute aggregation
  const entries = await LedgerEntry.aggregate(pipeline);

  return {
    entries,
    pagination: {
      total,
      count: entries.length,
      limit: parseInt(limit),
      pageNo: parseInt(pageNo),
      totalPages: Math.ceil(total / limit)
    }
  };
};

const addLedgerEntry = async (data) => {
  const { dematAccountId, tradeTransactionId, transactionAmount, date } = data;

  const dematAccount = await DematAccount.findById(dematAccountId);
  if (!dematAccount) {
    const error = new Error('Demat account not found');
    error.statusCode = 404;
    error.reasonCode = 'NOT_FOUND';
    throw error;
  }

  const ledgerEntry = await LedgerEntry.create({
    dematAccountId,
    tradeTransactionId,
    transactionAmount,
    date
  });

  return ledgerEntry;
};

module.exports = {
  getLedgerEntries,
  addLedgerEntry
};
