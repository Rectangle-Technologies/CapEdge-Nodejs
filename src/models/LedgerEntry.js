const mongoose = require('mongoose');

const ledgerEntrySchema = new mongoose.Schema({
  dematAccountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DematAccount',
    required: [true, 'Demat account ID is required'],
  },
  tradeTransactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction',
  },
  transactionAmount: {
    type: Number,
    required: [true, 'Transaction amount is required'],
    set: value => Math.round(value * 100) / 100 // Round to 2 decimal places
  },
  date: {
    type: Date,
    required: [true, 'Date is required'],
  },
}, {
  timestamps: true
});

module.exports = mongoose.model('LedgerEntry', ledgerEntrySchema);