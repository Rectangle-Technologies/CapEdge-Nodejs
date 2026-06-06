const Security = require('../models/Security');
const Transaction = require('../models/Transaction');
const Holdings = require('../models/Holdings');
const { DERIVATIVE_TYPES, NON_DERIVATIVE_TYPES, SECURITY_TYPES_ARRAY } = require('../constants');
const mongoose = require('mongoose');
const { updateRecords } = require('./recordService');

/**
 * Security Service
 * Handles all business logic for securities management
 */

/**
 * Get all securities with optional filters and pagination
 * @param {Object} filters - { name, search, type, exchangeId, limit, pageNo }
 * @returns {Promise<Object>} - { securities, pagination }
 */
const getSecurities = async (filters = {}) => {
  const { name, search, type, limit, pageNo = 1 } = filters;

  // Calculate offset from pageNo and limit
  const offset = (pageNo - 1) * limit;

  // Build query
  const query = {};
  if (name) {
    // Match with any type of case and partial match
    query.name = { $regex: name, $options: 'i' };
  }
  if (search) {
    // Search in security name (case-insensitive partial match)
    query.name = { $regex: search, $options: 'i' };
  }
  if (type) {
    query.type = type;
  }

  // Get total count
  const total = await Security.countDocuments(query);

  // Fetch securities with stock exchange details
  const securities = await Security.find(query)
    .sort({ name: 1 })
    .limit(parseInt(limit))
    .skip(parseInt(offset))
    .lean();

  // Sort splitHistory by splitDate for each security
  securities.forEach(security => {
    if (security.splitHistory && security.splitHistory.length > 0) {
      security.splitHistory.sort((a, b) => new Date(a.splitDate) - new Date(b.splitDate));
    }
  });

  return {
    securities,
    securityTypes: SECURITY_TYPES_ARRAY,
    pagination: {
      total,
      count: securities.length,
      limit: parseInt(limit),
      pageNo: parseInt(pageNo)
    }
  };
};

/**
 * Create a new security
 * @param {Object} securityData - { name, type, strikePrice, expiry, stockExchangeId }
 * @returns {Promise<Object>} - Created security
 */
const createSecurity = async (securityData) => {
  const { name, type, strikePrice, expiry, stockExchangeId } = securityData;

  // Validate derivative-specific fields
  if (DERIVATIVE_TYPES.includes(type)) {
    // Require strike price and expiry for derivatives
    if (!strikePrice || !expiry) {
      const error = new Error('Strike price and expiry are required for OPTIONS and FUTURES');
      error.statusCode = 422;
      error.reasonCode = 'BAD_REQUEST';
      error.field = !strikePrice ? 'strikePrice' : 'expiry';
      throw error;
    }

    // Validate expiry is in future
    if (new Date(expiry) <= new Date()) {
      const error = new Error('Expiry date must be in the future for derivatives');
      error.statusCode = 422;
      error.reasonCode = 'BAD_REQUEST';
      error.field = 'expiry';
      throw error;
    }
  } else if (NON_DERIVATIVE_TYPES.includes(type)) {
    // Ensure strike price and expiry are null for non-derivatives
    if (strikePrice !== undefined || expiry !== undefined) {
      const error = new Error('Strike price and expiry should be null for non-derivative securities');
      error.statusCode = 422;
      error.reasonCode = 'BAD_REQUEST';
      error.field = strikePrice !== undefined ? 'strikePrice' : 'expiry';
      throw error;
    }
  }

  // Check for duplicate security name
  const existingSecurity = await Security.findOne({ name: name.trim(), type });
  if (existingSecurity) {
    const error = new Error('Security with this name and type already exists');
    error.statusCode = 409;
    error.reasonCode = 'ALREADY_EXISTS';
    throw error;
  }

  // Create security
  const security = new Security({
    name,
    type,
    strikePrice: DERIVATIVE_TYPES.includes(type) ? strikePrice : null,
    expiry: DERIVATIVE_TYPES.includes(type) ? expiry : null
  });

  const createdSecurity = await security.save();
  return createdSecurity;
};

/**
 * Bulk create securities from an array
 * @param {Array} securitiesData - Array of security objects
 * @returns {Promise<Object>} - { created, failed, summary }
 */
const bulkCreateSecurities = async (securitiesData) => {
  const results = {
    created: [],
    failed: [],
    summary: {
      total: securitiesData.length,
      successful: 0,
      failed: 0
    }
  };

  // Process each security
  for (let i = 0; i < securitiesData.length; i++) {
    const item = securitiesData[i];
    createSecurity(item)
      .then(security => {
        console.log(`Successfully created security: ${security.name}`);
      })
  }

  return results;
};

/**
 * Update an existing security
 * @param {String} securityId - Security ID
 * @param {Object} updateData - { name, type, strikePrice, expiry, stockExchangeId }
 * @returns {Promise<Object>} - Updated security
 */
const updateSecurity = async (securityId, updateData) => {
  const { name, type, strikePrice, expiry } = updateData;

  // Check if security exists
  const security = await Security.findById(securityId);
  if (!security) {
    const error = new Error('Security not found');
    error.statusCode = 404;
    error.reasonCode = 'NOT_FOUND';
    throw error;
  }

  // Validate derivative-specific fields
  if (DERIVATIVE_TYPES.includes(type)) {
    if (!strikePrice || !expiry) {
      const error = new Error('Strike price and expiry are required for OPTIONS and FUTURES');
      error.statusCode = 400;
      throw error;
    }

    if (new Date(expiry) <= new Date()) {
      const error = new Error('Expiry date must be in the future for derivatives');
      error.statusCode = 400;
      throw error;
    }
  } else if (NON_DERIVATIVE_TYPES.includes(type)) {
    if (strikePrice !== undefined || expiry !== undefined) {
      const error = new Error('Strike price and expiry should be null for non-derivative securities');
      error.statusCode = 400;
      throw error;
    }
  }

  // Check for duplicate security name
  const existingSecurity = await Security.findOne({
    _id: { $ne: securityId },
    name: name.trim(),
    type
  });
  if (existingSecurity) {
    const error = new Error('Another security with this name and type already exists');
    error.statusCode = 409;
    error.reasonCode = 'ALREADY_EXISTS';
    throw error;
  }

  // Update security
  security.name = name;
  security.strikePrice = DERIVATIVE_TYPES.includes(type) ? strikePrice : null;
  security.expiry = DERIVATIVE_TYPES.includes(type) ? expiry : null;

  await security.save();

  return security;
};

/**
 * Delete a security
 * @param {String} securityId - Security ID
 * @returns {Promise<void>}
 */
const deleteSecurity = async (securityId) => {
  // Check if security exists
  const security = await Security.findById(securityId);
  if (!security) {
    const error = new Error('Security not found');
    error.statusCode = 404;
    throw error;
  }

  // Check for dependent transactions
  const transactionCount = await Transaction.countDocuments({ securityId });
  if (transactionCount > 0) {
    const error = new Error('Cannot delete security with associated transactions');
    error.statusCode = 400;
    throw error;
  }

  // Check for dependent holdings
  const holdingsCount = await Holdings.countDocuments({ securityId });
  if (holdingsCount > 0) {
    const error = new Error('Cannot delete security with existing holdings');
    error.statusCode = 400;
    throw error;
  }

  // Delete security
  await Security.findByIdAndDelete(securityId);
};

const processSplit = async (payload) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { securityId, splitDate, splitRatio, transactions } = payload;

    const security = await Security.findById(securityId).session(session);
    if (!security) {
      const error = new Error('Security not found');
      error.statusCode = 404;
      error.reasonCode = 'NOT_FOUND';
      throw error;
    }

    const latestTransaction = await Transaction.findOne({ securityId })
      .sort({ date: -1 })
      .session(session);
    if (latestTransaction && new Date(splitDate) < latestTransaction.date) {
      const error = new Error('Split date cannot be before the latest transaction date for this security');
      error.statusCode = 400;
      error.reasonCode = 'BAD_REQUEST';
      throw error;
    }

    // Reject re-submission of the same transaction within the same split event
    // (same calendar day + same ratio). Multiple distinct splits over the
    // security's life (different dates or different ratios) remain allowed —
    // the same lot legitimately participates in each.
    const sameDayKey = new Date(splitDate).toISOString().split('T')[0];
    const existingSplitEntry = security.splitHistory.find(
      s => s.splitRatio === splitRatio &&
           new Date(s.splitDate).toISOString().split('T')[0] === sameDayKey
    );
    if (existingSplitEntry) {
      const alreadySplitIds = new Set(
        existingSplitEntry.transactions.map(t => t.transactionId.toString())
      );
      const duplicate = transactions.find(
        t => alreadySplitIds.has(t.transactionId.toString())
      );
      if (duplicate) {
        console.error(
          `[processSplit] duplicate: txId=${duplicate.transactionId} already in splitHistory entry (${splitRatio}, ${sameDayKey})`
        );
        const error = new Error(
          `A ${splitRatio} split on ${sameDayKey} has already been recorded for one or more of the selected holdings. ` +
          `Cannot apply the same split twice.`
        );
        error.statusCode = 409;
        error.reasonCode = 'ALREADY_EXISTS';
        throw error;
      }
    }

    // Collected during the loop and used after for the aggregate cross-check
    // and for triggering a focused FY snapshot rebuild per affected demat.
    const branchARequiredByDemat = new Map();   // dematId(string) -> sum(assumedSoldQty)
    const earliestDateByDemat = new Map();      // dematId(string) -> earliest tx.date

    for (const txData of transactions) {
      const [txn, holding] = await Promise.all([
        Transaction.findById(txData.transactionId).session(session),
        Holdings.findById(txData.holdingId).session(session)
      ]);
      if (!txn) {
        const error = new Error(`Transaction not found: ${txData.transactionId}`);
        error.statusCode = 404;
        error.reasonCode = 'NOT_FOUND';
        throw error;
      }
      if (!holding) {
        const error = new Error(`Holding not found: ${txData.holdingId}`);
        error.statusCode = 404;
        error.reasonCode = 'NOT_FOUND';
        throw error;
      }

      // Invariant: the holding's persisted quantity must equal what the client
      // submitted as quantityBeforeSplit. If they differ, the client is operating
      // on stale data (e.g. holdings regressed by a prior updateRecords pass)
      // and we refuse rather than letting Branch A fabricate phantom shares.
      if (Number(holding.quantity) !== Number(txData.quantityBeforeSplit)) {
        console.error(
          `[processSplit] holding qty mismatch: holdingId=${holding._id} db.qty=${holding.quantity} client.qBeforeSplit=${txData.quantityBeforeSplit}`
        );
        const error = new Error('The holding data is out of date. Please refresh the page and try again.');
        error.statusCode = 409;
        error.reasonCode = 'STATE_MISMATCH';
        throw error;
      }

      // Defensive: a consistent DB never has tx.quantity < holding.quantity for
      // a holding pointing at that tx — the holding can only shrink from
      // FIFO-matched sells, never grow beyond the BUY's original quantity.
      if (txn.quantity < txData.quantityBeforeSplit) {
        console.error(
          `[processSplit] tx.qty < holding.qty: txId=${txn._id} txQty=${txn.quantity} holdingQty=${txData.quantityBeforeSplit}`
        );
        const error = new Error('Data inconsistency detected — this split cannot be processed. Please contact support.');
        error.statusCode = 409;
        error.reasonCode = 'DATA_INCONSISTENCY';
        throw error;
      }

      const dematKey = txn.dematAccountId.toString();
      const prevEarliest = earliestDateByDemat.get(dematKey);
      if (!prevEarliest || txn.date < prevEarliest) {
        earliestDateByDemat.set(dematKey, txn.date);
      }

      if (txn.quantity > txData.quantityBeforeSplit) {
        // Branch A: this BUY was partially sold. The "assumed sold" residual
        // must be backed by historical SELL activity in (security, demat)
        // between the BUY date and the split date — this guard replaces the
        // previous unverified `soldQty` inference, which is what allowed the
        // regression-induced double-run to fabricate phantom transactions.
        const assumedSoldQty = txn.quantity - txData.quantityBeforeSplit;

        const sellAgg = await Transaction.aggregate([
          { $match: {
              securityId: txn.securityId,
              dematAccountId: txn.dematAccountId,
              type: 'SELL',
              deliveryType: 'Delivery',
              date: { $lt: new Date(splitDate), $gte: txn.date }
          }},
          { $group: { _id: null, total: { $sum: '$quantity' } } }
        ]).session(session);
        const sold = sellAgg[0]?.total ?? 0;

        if (sold < assumedSoldQty) {
          console.error(
            `[processSplit] sell coverage missing: txId=${txn._id} txQty=${txn.quantity} qBeforeSplit=${txData.quantityBeforeSplit} required=${assumedSoldQty} actualSold=${sold}`
          );
          const error = new Error(
            'Cannot apply this split — the underlying transaction data suggests this lot may have already been split. ' +
            'Please refresh the page and try again. If the issue persists, contact support.'
          );
          error.statusCode = 409;
          error.reasonCode = 'SELL_COVERAGE_MISSING';
          throw error;
        }

        branchARequiredByDemat.set(
          dematKey,
          (branchARequiredByDemat.get(dematKey) || 0) + assumedSoldQty
        );

        // Reduce OLD transaction to the residual qty.
        txn.quantity = assumedSoldQty;

        // Clone OLD into a NEW transaction representing the post-split lot.
        const newTrnDetails = { ...txn.toObject() };
        newTrnDetails.quantity = txData.quantityAfterSplit;
        newTrnDetails.price = txData.priceAfterSplit;
        delete newTrnDetails._id;
        delete newTrnDetails.id;
        delete newTrnDetails.createdAt;
        delete newTrnDetails.updatedAt;
        const newTransaction = new Transaction(newTrnDetails);

        holding.quantity = txData.quantityAfterSplit;
        holding.price = txData.priceAfterSplit;

        const [, savedNew] = await Promise.all([
          txn.save({ session }),
          newTransaction.save({ session })
        ]);

        // Re-link holding to the new transaction and rewrite txData so the
        // splitHistory entry stores the post-split tx id.
        txData.transactionId = savedNew._id;
        holding.transactionId = savedNew._id;
        await holding.save({ session });
      } else {
        // Branch C: tx.qty === quantityBeforeSplit === holding.qty (by invariant
        // above). Move transaction and holding from pre-split to post-split
        // values in lockstep.
        txn.quantity = txData.quantityAfterSplit;
        txn.price = txData.priceAfterSplit;
        holding.quantity = txData.quantityAfterSplit;
        holding.price = txData.priceAfterSplit;
        await Promise.all([
          txn.save({ session }),
          holding.save({ session })
        ]);
      }
    }

    // Per-demat aggregate cross-check. Each Branch A submission passed its
    // per-BUY check individually, but the sum across submissions for the same
    // demat must still fit within the demat's total SELL history up to splitDate.
    // Closes the gap where individual lots pass but their combined required
    // SELL coverage exceeds what's ever been sold.
    for (const [dematKey, totalRequired] of branchARequiredByDemat) {
      const agg = await Transaction.aggregate([
        { $match: {
            securityId: new mongoose.Types.ObjectId(securityId),
            dematAccountId: new mongoose.Types.ObjectId(dematKey),
            type: 'SELL',
            deliveryType: 'Delivery',
            date: { $lt: new Date(splitDate) }
        }},
        { $group: { _id: null, total: { $sum: '$quantity' } } }
      ]).session(session);
      const aggregateSold = agg[0]?.total ?? 0;

      if (totalRequired > aggregateSold) {
        console.error(
          `[processSplit] aggregate sell coverage missing: secId=${securityId} demId=${dematKey} required=${totalRequired} aggregateSold=${aggregateSold}`
        );
        const error = new Error(
          'Cannot apply this split — the data across the selected lots is inconsistent. ' +
          'Please refresh the page and try again. If the issue persists, contact support.'
        );
        error.statusCode = 409;
        error.reasonCode = 'SELL_COVERAGE_MISSING';
        throw error;
      }
    }

    // Record the split event — merge into the existing entry for this
    // (date, ratio) if one exists (e.g. user noticed a missed lot mid-process
    // and re-submitted with new lots only), else push a fresh entry.
    if (existingSplitEntry) {
      existingSplitEntry.transactions.push(...transactions);
    } else {
      security.splitHistory.push({ splitDate, splitRatio, transactions });
    }
    await security.save({ session });

    // Propagate the split through FY snapshots and re-derive Holdings for
    // every affected demat from the now-correct transactions. Without this,
    // any subsequent updateRecords call (transaction edit, ledger edit, etc.)
    // would seed from a frozen pre-split snapshot and silently revert Holdings.
    // Scoped to just the affected demats and anchored at the earliest affected
    // BUY's date, so the rebuild is far cheaper than a full-history /ledger/fix.
    for (const [dematKey, earliestDate] of earliestDateByDemat) {
      await updateRecords(earliestDate, dematKey, session);
    }

    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

module.exports = {
  getSecurities,
  createSecurity,
  bulkCreateSecurities,
  updateSecurity,
  deleteSecurity,
  processSplit
};
