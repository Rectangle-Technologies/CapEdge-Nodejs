const mongoose = require('mongoose');

const ledgerEntrySchema = new mongoose.Schema({
  dematAccountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DematAccount',
    required: [true, 'Demat account ID is required'],
  },
  tradeTransactionIds: {
    type: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction',
    }],
    default: [],
    index: true
  },
  transactionAmount: {
    type: Number,
    required: [true, 'Transaction amount is required']
  },
  date: {
    type: Date,
    required: [true, 'Date is required'],
  },
  remarks: {
    type: String,
    trim: true,
    required: [true, 'Remarks are required'],
  },
  balanceAfterEntry: {
    type: Number,
    default: null
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('LedgerEntry', ledgerEntrySchema);