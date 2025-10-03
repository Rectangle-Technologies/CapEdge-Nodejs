const LedgerEntry = require('../models/LedgerEntry');
const logger = require('../utils/logger');

/**
 * Ledger Service
 * Handles all business logic for ledger management
 */

/**
 * Get ledger entries with filters and running balance
 * @param {Object} filters - { startDate, endDate, dematAccountId, transactionType, limit, offset }
 * @returns {Promise<Object>} - { entries, summary, pagination }
 */
const getLedgerEntries = async (filters = {}) => {
  try {
    const { startDate, endDate, dematAccountId, transactionType, limit = 50, offset = 0 } = filters;
    
    // Build match query
    const matchQuery = {};
    
    if (startDate || endDate) {
      matchQuery.date = {};
      if (startDate) matchQuery.date.$gte = new Date(startDate);
      if (endDate) matchQuery.date.$lte = new Date(endDate);
    }
    
    if (dematAccountId) matchQuery.dematAccountId = dematAccountId;

    // Aggregation pipeline for ledger entries
    const pipeline = [
      { $match: matchQuery },
      {
        $lookup: {
          from: 'demataccounts',
          localField: 'dematAccountId',
          foreignField: '_id',
          as: 'dematAccount'
        }
      },
      {
        $unwind: '$dematAccount'
      },
      {
        $lookup: {
          from: 'useraccounts',
          localField: 'dematAccount.userAccountId',
          foreignField: '_id',
          as: 'userAccount'
        }
      },
      {
        $lookup: {
          from: 'brokers',
          localField: 'dematAccount.brokerId',
          foreignField: '_id',
          as: 'broker'
        }
      },
      {
        $unwind: '$userAccount'
      },
      {
        $unwind: '$broker'
      },
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
        $lookup: {
          from: 'stockexchanges',
          localField: 'security.stockExchangeId',
          foreignField: '_id',
          as: 'stockExchange'
        }
      },
      {
        $unwind: {
          path: '$stockExchange',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $addFields: {
          transactionType: {
            $cond: [
              { $gt: ['$amount', 0] },
              'CREDIT',
              'DEBIT'
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
            'transaction.type': 'BUY'
          }
        });
      } else if (transactionType === 'SELL') {
        pipeline.push({
          $match: {
            'transaction.type': 'SELL'
          }
        });
      } else if (transactionType === 'CREDIT') {
        pipeline.push({
          $match: {
            amount: { $gt: 0 }
          }
        });
      } else if (transactionType === 'DEBIT') {
        pipeline.push({
          $match: {
            amount: { $lt: 0 }
          }
        });
      }
    }

    // Project final fields
    pipeline.push({
      $project: {
        date: 1,
        amount: 1,
        transactionType: 1,
        dematAccount: {
          _id: 1,
          balance: 1
        },
        userAccount: {
          name: 1,
          panNumber: 1
        },
        broker: {
          name: 1
        },
        transaction: {
          _id: 1,
          type: 1,
          quantity: 1,
          price: 1,
          deliveryType: 1
        },
        security: {
          _id: 1,
          name: 1,
          type: 1
        },
        stockExchange: {
          name: 1,
          code: 1
        },
        tradeTransactionId: 1,
        createdAt: 1
      }
    });

    pipeline.push({
      $sort: { date: -1, createdAt: -1 }
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

    // Calculate running balance (application-level)
    // Note: For better performance with large datasets, consider storing running balance in DB
    let runningBalance = 0;
    if (dematAccountId && entries.length > 0) {
      // Get initial balance up to the first entry
      const firstEntryDate = entries[entries.length - 1].date;
      const priorEntries = await LedgerEntry.aggregate([
        {
          $match: {
            dematAccountId,
            date: { $lt: firstEntryDate }
          }
        },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: '$amount' }
          }
        }
      ]);

      runningBalance = priorEntries.length > 0 ? priorEntries[0].totalAmount : 0;

      // Add running balance to each entry (reverse order for calculation)
      for (let i = entries.length - 1; i >= 0; i--) {
        runningBalance += entries[i].amount;
        entries[i].runningBalance = runningBalance;
      }
    } else {
      // If no specific demat account, just add cumulative for display
      entries.forEach(entry => {
        runningBalance += entry.amount;
        entry.runningBalance = runningBalance;
      });
    }

    // Calculate summary
    const summaryPipeline = [
      { $match: matchQuery }
    ];

    if (transactionType) {
      if (transactionType === 'CREDIT') {
        summaryPipeline.push({
          $match: {
            amount: { $gt: 0 }
          }
        });
      } else if (transactionType === 'DEBIT') {
        summaryPipeline.push({
          $match: {
            amount: { $lt: 0 }
          }
        });
      }
    }

    summaryPipeline.push({
      $group: {
        _id: null,
        totalDebits: {
          $sum: {
            $cond: [{ $lt: ['$amount', 0] }, '$amount', 0]
          }
        },
        totalCredits: {
          $sum: {
            $cond: [{ $gt: ['$amount', 0] }, '$amount', 0]
          }
        },
        netAmount: { $sum: '$amount' },
        totalEntries: { $sum: 1 }
      }
    });

    const summaryResult = await LedgerEntry.aggregate(summaryPipeline);
    const summary = summaryResult.length > 0 ? summaryResult[0] : {
      totalDebits: 0,
      totalCredits: 0,
      netAmount: 0,
      totalEntries: 0
    };

    delete summary._id;

    // Add current balance for specific demat account
    if (dematAccountId) {
      const allEntries = await LedgerEntry.aggregate([
        {
          $match: { dematAccountId }
        },
        {
          $group: {
            _id: null,
            currentBalance: { $sum: '$amount' }
          }
        }
      ]);

      summary.currentBalance = allEntries.length > 0 ? allEntries[0].currentBalance : 0;
    }

    return {
      entries,
      summary,
      pagination: {
        total,
        count: entries.length,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    };
  } catch (error) {
    logger.error('Error in getLedgerEntries service:', error);
    throw error;
  }
};

module.exports = {
  getLedgerEntries
};
