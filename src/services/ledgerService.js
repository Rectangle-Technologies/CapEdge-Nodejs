const { default: mongoose } = require('mongoose');
const DematAccount = require('../models/DematAccount');
const LedgerEntry = require('../models/LedgerEntry');
const { updateRecords } = require('./recordService');

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
  const { startDate, endDate, dematAccountId, transactionType, limit = 50, pageNo = 1, sortDirection = 'desc' } = filters;
  const sortOrder = sortDirection === 'asc' ? 1 : -1;

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

  // Aggregation pipeline for ledger entries. Each entry may bundle 0..N trades:
  //   - 0 trades -> manual CREDIT/DEBIT
  //   - 1 trade  -> single-trade bundle, chip uses that trade's type
  //   - 2+       -> multi-trade bundle, type = 'BUNDLE' (UI hides chip)
  const pipeline = [
    { $match: matchQuery },
    {
      $lookup: {
        from: 'transactions',
        let: { txIds: '$tradeTransactionIds' },
        pipeline: [
          { $match: { $expr: { $in: ['$_id', { $ifNull: ['$$txIds', []] }] } } },
          {
            $lookup: {
              from: 'securities',
              localField: 'securityId',
              foreignField: '_id',
              as: 'security'
            }
          },
          { $unwind: { path: '$security', preserveNullAndEmptyArrays: true } },
          { $sort: { _id: 1 } },
          {
            $project: {
              _id: 1,
              type: 1,
              quantity: 1,
              price: 1,
              referenceNumber: 1,
              securityName: '$security.name'
            }
          }
        ],
        as: 'trades'
      }
    },
    {
      $addFields: {
        type: {
          $switch: {
            branches: [
              {
                case: { $eq: [{ $size: '$trades' }, 0] },
                then: {
                  $cond: { if: { $gt: ['$transactionAmount', 0] }, then: 'CREDIT', else: 'DEBIT' }
                }
              },
              {
                case: { $eq: [{ $size: '$trades' }, 1] },
                then: { $arrayElemAt: ['$trades.type', 0] }
              }
            ],
            default: 'BUNDLE'
          }
        }
      }
    }
  ];

  // BUY/SELL filters match any trade in a bundle. CREDIT/DEBIT only match
  // non-trade entries.
  if (transactionType === 'BUY' || transactionType === 'SELL') {
    pipeline.push({ $match: { 'trades.type': transactionType } });
  } else if (transactionType === 'CREDIT' || transactionType === 'DEBIT') {
    pipeline.push({ $match: { type: transactionType } });
  }

  // Sort by date in the requested direction (default newest -> oldest;
  // UI listing passes 'asc' for chronological order).
  pipeline.push({
    $sort: { date: sortOrder, createdAt: sortOrder }
  });

  // Project final fields
  pipeline.push({
    $project: {
      date: 1,
      type: 1,
      transactionAmount: 1,
      remarks: 1,
      balanceAfterEntry: 1,
      trades: 1
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

  // Opening balance = running balance as of startDate, computed as the sum of
  // transactionAmount across all entries for this demat account dated strictly
  // before startDate. Robust against entries with null balanceAfterEntry.
  let openingBalance = 0;
  if (startDate) {
    const openingAgg = await LedgerEntry.aggregate([
      {
        $match: {
          dematAccountId: dematAccount._id,
          date: { $lt: new Date(startDate) }
        }
      },
      { $group: { _id: null, total: { $sum: '$transactionAmount' } } }
    ]);
    openingBalance = openingAgg[0]?.total || 0;
  }

  return {
    entries,
    openingBalance,
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
  const { dematAccountId, transactionAmount, date, remarks } = data;

  const dematAccount = await DematAccount.findById(dematAccountId);
  if (!dematAccount) {
    const error = new Error('Demat account not found');
    error.statusCode = 404;
    error.reasonCode = 'NOT_FOUND';
    throw error;
  }

  const session = await mongoose.startSession();
  try {
    session.startTransaction({
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
      readPreference: 'primary'
    });

    const ledgerEntry = await LedgerEntry.create([{
      dematAccountId,
      transactionAmount,
      date,
      remarks
    }], { session });

    await updateRecords(date, dematAccountId, session);
    
    // Find the latest balance of demat account
    const updatedDematAccount = await DematAccount.findById(dematAccountId).session(session);
    const latestBalance = updatedDematAccount ? updatedDematAccount.balance : null;

    await session.commitTransaction();

    return { ledgerEntry: ledgerEntry[0], latestBalance };
  } catch (error) {
    console.error("Error in addLedgerEntry:", error);
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
};

const fixLedgerEntries = async (data) => {
  const { date } = data;
  const session = await mongoose.startSession();
  try {
    session.startTransaction({
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
      readPreference: 'primary'
    });

    const dematAccounts = await DematAccount.find().session(session);
    
    for (let dematAccount of dematAccounts) {
      await updateRecords(date, dematAccount._id, session);
    }

    await session.commitTransaction();

    return { message: 'Ledger entries fixed successfully' };
  } catch (error) {
    console.error("Error in fixLedgerEntries:", error);
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
}

const deleteLedgerEntry = async (entryId) => {
  const entry = await LedgerEntry.findById(entryId);
  if (!entry) {
    const error = new Error('Ledger entry not found');
    error.statusCode = 404;
    error.reasonCode = 'NOT_FOUND';
    throw error;
  }

  if (entry.tradeTransactionIds && entry.tradeTransactionIds.length > 0) {
    const error = new Error('Cannot delete a trade-linked ledger entry. Delete the associated transaction instead.');
    error.statusCode = 400;
    error.reasonCode = 'TRADE_LINKED';
    throw error;
  }

  const session = await mongoose.startSession();
  try {
    session.startTransaction({
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
      readPreference: 'primary'
    });

    await LedgerEntry.deleteOne({ _id: entryId }).session(session);
    await updateRecords(entry.date, entry.dematAccountId, session);

    const updatedDematAccount = await DematAccount.findById(entry.dematAccountId).session(session);
    const latestBalance = updatedDematAccount ? updatedDematAccount.balance : null;

    await session.commitTransaction();
    return { latestBalance };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
};

const editLedgerEntry = async (entryId, data) => {
  const entry = await LedgerEntry.findById(entryId);
  if (!entry) {
    const error = new Error('Ledger entry not found');
    error.statusCode = 404;
    error.reasonCode = 'NOT_FOUND';
    throw error;
  }

  if (entry.tradeTransactionIds && entry.tradeTransactionIds.length > 0) {
    const error = new Error('Cannot edit a trade-linked ledger entry. Edit the associated transaction instead.');
    error.statusCode = 400;
    error.reasonCode = 'TRADE_LINKED';
    throw error;
  }

  const { dematAccountId, transactionAmount, date, remarks } = data;

  const dematAccount = await DematAccount.findById(dematAccountId);
  if (!dematAccount) {
    const error = new Error('Demat account not found');
    error.statusCode = 404;
    error.reasonCode = 'NOT_FOUND';
    throw error;
  }

  const oldDate = entry.date;
  const newDate = new Date(date);

  const session = await mongoose.startSession();
  try {
    session.startTransaction({
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
      readPreference: 'primary'
    });

    // Remove old entry and recalculate from the old date.
    await LedgerEntry.deleteOne({ _id: entryId }).session(session);
    await updateRecords(oldDate, dematAccountId, session);

    // Create replacement entry and recalculate from the new date.
    const newEntry = await LedgerEntry.create([{
      dematAccountId,
      transactionAmount,
      date: newDate,
      remarks
    }], { session });

    await updateRecords(newDate, dematAccountId, session);

    const updatedDematAccount = await DematAccount.findById(dematAccountId).session(session);
    const latestBalance = updatedDematAccount ? updatedDematAccount.balance : null;

    await session.commitTransaction();

    return { ledgerEntry: newEntry[0], latestBalance };
  } catch (error) {
    console.error('Error in editLedgerEntry:', error);
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
};

module.exports = {
  getLedgerEntries,
  addLedgerEntry,
  deleteLedgerEntry,
  editLedgerEntry,
  fixLedgerEntries
};
