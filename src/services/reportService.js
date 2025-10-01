const MatchedRecords = require('../models/MatchedRecords');
const UnmatchedRecords = require('../models/UnmatchedRecords');
const logger = require('../utils/logger');

/**
 * Report Service
 * Handles all business logic for P&L and Holdings reports
 */

/**
 * Get P&L (Profit & Loss) records with filters
 * @param {Object} filters - { startDate, endDate, capitalGainType, dematAccountId, limit, offset }
 * @returns {Promise<Object>} - { records, summary, pagination }
 */
const getPnLRecords = async (filters = {}) => {
  try {
    const { startDate, endDate, capitalGainType, dematAccountId, limit = 50, offset = 0 } = filters;
    
    // Build match query
    const matchQuery = {};
    
    if (startDate || endDate) {
      matchQuery.sellDate = {};
      if (startDate) matchQuery.sellDate.$gte = new Date(startDate);
      if (endDate) matchQuery.sellDate.$lte = new Date(endDate);
    }
    
    if (capitalGainType) matchQuery.capitalGainType = capitalGainType;
    if (dematAccountId) matchQuery.dematAccountId = dematAccountId;

    // Aggregation pipeline for P&L report
    const pipeline = [
      { $match: matchQuery },
      {
        $lookup: {
          from: 'transactions',
          localField: 'buyTransactionId',
          foreignField: '_id',
          as: 'buyTransaction'
        }
      },
      {
        $lookup: {
          from: 'transactions',
          localField: 'sellTransactionId',
          foreignField: '_id',
          as: 'sellTransaction'
        }
      },
      {
        $lookup: {
          from: 'securities',
          localField: 'securityId',
          foreignField: '_id',
          as: 'security'
        }
      },
      {
        $lookup: {
          from: 'demataccounts',
          localField: 'dematAccountId',
          foreignField: '_id',
          as: 'dematAccount'
        }
      },
      {
        $unwind: '$buyTransaction'
      },
      {
        $unwind: '$sellTransaction'
      },
      {
        $unwind: '$security'
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
        $lookup: {
          from: 'stockexchanges',
          localField: 'security.stockExchangeId',
          foreignField: '_id',
          as: 'stockExchange'
        }
      },
      {
        $unwind: '$userAccount'
      },
      {
        $unwind: '$broker'
      },
      {
        $unwind: '$stockExchange'
      },
      {
        $addFields: {
          holdingPeriod: {
            $divide: [
              { $subtract: ['$sellDate', '$buyDate'] },
              1000 * 60 * 60 * 24 // Convert milliseconds to days
            ]
          }
        }
      },
      {
        $project: {
          buyDate: 1,
          sellDate: 1,
          quantity: 1,
          buyPrice: 1,
          sellPrice: 1,
          profitLoss: 1,
          capitalGainType: 1,
          holdingPeriod: 1,
          security: {
            _id: 1,
            name: 1,
            type: 1
          },
          stockExchange: {
            name: 1,
            code: 1
          },
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
          buyTransactionId: 1,
          sellTransactionId: 1
        }
      },
      {
        $sort: { sellDate: -1 }
      }
    ];

    // Get total count
    const countPipeline = [...pipeline, { $count: 'total' }];
    const countResult = await MatchedRecords.aggregate(countPipeline);
    const total = countResult.length > 0 ? countResult[0].total : 0;

    // Add pagination
    pipeline.push({ $skip: parseInt(offset) });
    pipeline.push({ $limit: parseInt(limit) });

    // Execute aggregation
    const records = await MatchedRecords.aggregate(pipeline);

    // Calculate summary
    const summaryPipeline = [
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalProfit: {
            $sum: {
              $cond: [{ $gt: ['$profitLoss', 0] }, '$profitLoss', 0]
            }
          },
          totalLoss: {
            $sum: {
              $cond: [{ $lt: ['$profitLoss', 0] }, '$profitLoss', 0]
            }
          },
          netProfitLoss: { $sum: '$profitLoss' },
          totalTrades: { $sum: 1 },
          stcgCount: {
            $sum: {
              $cond: [{ $eq: ['$capitalGainType', 'STCG'] }, 1, 0]
            }
          },
          ltcgCount: {
            $sum: {
              $cond: [{ $eq: ['$capitalGainType', 'LTCG'] }, 1, 0]
            }
          },
          stcgProfitLoss: {
            $sum: {
              $cond: [{ $eq: ['$capitalGainType', 'STCG'] }, '$profitLoss', 0]
            }
          },
          ltcgProfitLoss: {
            $sum: {
              $cond: [{ $eq: ['$capitalGainType', 'LTCG'] }, '$profitLoss', 0]
            }
          }
        }
      }
    ];

    const summaryResult = await MatchedRecords.aggregate(summaryPipeline);
    const summary = summaryResult.length > 0 ? summaryResult[0] : {
      totalProfit: 0,
      totalLoss: 0,
      netProfitLoss: 0,
      totalTrades: 0,
      stcgCount: 0,
      ltcgCount: 0,
      stcgProfitLoss: 0,
      ltcgProfitLoss: 0
    };

    delete summary._id;

    return {
      records,
      summary,
      pagination: {
        total,
        count: records.length,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    };
  } catch (error) {
    logger.error('Error in getPnLRecords service:', error);
    throw error;
  }
};

/**
 * Get Holdings (current positions) with filters
 * @param {Object} filters - { securityName, securityType, dematAccountId, limit, offset }
 * @returns {Promise<Object>} - { holdings, summary, pagination }
 */
const getHoldings = async (filters = {}) => {
  try {
    const { securityName, securityType, dematAccountId, limit = 50, offset = 0 } = filters;
    
    // Build match query
    const matchQuery = {};
    if (dematAccountId) matchQuery.dematAccountId = dematAccountId;

    // Aggregation pipeline for holdings report
    const pipeline = [
      { $match: matchQuery },
      {
        $lookup: {
          from: 'securities',
          localField: 'securityId',
          foreignField: '_id',
          as: 'security'
        }
      },
      {
        $unwind: '$security'
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
        $unwind: '$stockExchange'
      },
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
      }
    ];

    // Add security name filter if provided
    if (securityName) {
      pipeline.push({
        $match: {
          'security.name': { $regex: securityName, $options: 'i' }
        }
      });
    }

    // Add security type filter if provided
    if (securityType) {
      pipeline.push({
        $match: {
          'security.type': securityType
        }
      });
    }

    // Add calculated fields
    pipeline.push({
      $addFields: {
        totalInvestment: { $multiply: ['$quantity', '$buyPrice'] },
        // Note: currentMarketPrice should be fetched from external API in production
        // For now, we'll leave it as null or use buyPrice as placeholder
        currentMarketPrice: '$buyPrice', // Placeholder
        currentValue: { $multiply: ['$quantity', '$buyPrice'] }, // Placeholder
        unrealizedPnL: 0, // Placeholder - needs real-time market data
        pnlPercentage: 0, // Placeholder
        holdingDays: {
          $floor: {
            $divide: [
              { $subtract: [new Date(), '$buyDate'] },
              1000 * 60 * 60 * 24
            ]
          }
        }
      }
    });

    // Project final fields
    pipeline.push({
      $project: {
        buyDate: 1,
        quantity: 1,
        buyPrice: 1,
        totalInvestment: 1,
        currentMarketPrice: 1,
        currentValue: 1,
        unrealizedPnL: 1,
        pnlPercentage: 1,
        holdingDays: 1,
        security: {
          _id: 1,
          name: 1,
          type: 1
        },
        stockExchange: {
          name: 1,
          code: 1
        },
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
        buyTransactionId: 1
      }
    });

    pipeline.push({
      $sort: { buyDate: 1 }
    });

    // Get total count
    const countPipeline = [...pipeline, { $count: 'total' }];
    const countResult = await UnmatchedRecords.aggregate(countPipeline);
    const total = countResult.length > 0 ? countResult[0].total : 0;

    // Add pagination
    pipeline.push({ $skip: parseInt(offset) });
    pipeline.push({ $limit: parseInt(limit) });

    // Execute aggregation
    const holdings = await UnmatchedRecords.aggregate(pipeline);

    // Calculate summary
    const summaryPipeline = [
      { $match: matchQuery }
    ];

    // Add filters to summary as well
    if (securityName || securityType) {
      summaryPipeline.push(
        {
          $lookup: {
            from: 'securities',
            localField: 'securityId',
            foreignField: '_id',
            as: 'security'
          }
        },
        {
          $unwind: '$security'
        }
      );

      const summaryMatch = {};
      if (securityName) {
        summaryMatch['security.name'] = { $regex: securityName, $options: 'i' };
      }
      if (securityType) {
        summaryMatch['security.type'] = securityType;
      }
      summaryPipeline.push({ $match: summaryMatch });
    }

    summaryPipeline.push({
      $group: {
        _id: null,
        totalInvestment: {
          $sum: { $multiply: ['$quantity', '$buyPrice'] }
        },
        totalCurrentValue: {
          $sum: { $multiply: ['$quantity', '$buyPrice'] } // Placeholder
        },
        totalUnrealizedPnL: { $sum: 0 }, // Placeholder
        totalHoldings: { $sum: 1 },
        totalQuantity: { $sum: '$quantity' }
      }
    });

    const summaryResult = await UnmatchedRecords.aggregate(summaryPipeline);
    const summary = summaryResult.length > 0 ? summaryResult[0] : {
      totalInvestment: 0,
      totalCurrentValue: 0,
      totalUnrealizedPnL: 0,
      totalHoldings: 0,
      totalQuantity: 0
    };

    delete summary._id;

    // Add portfolio performance metrics
    summary.portfolioReturn = summary.totalInvestment > 0
      ? ((summary.totalUnrealizedPnL / summary.totalInvestment) * 100).toFixed(2)
      : 0;

    return {
      holdings,
      summary,
      pagination: {
        total,
        count: holdings.length,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    };
  } catch (error) {
    logger.error('Error in getHoldings service:', error);
    throw error;
  }
};

module.exports = {
  getPnLRecords,
  getHoldings
};
