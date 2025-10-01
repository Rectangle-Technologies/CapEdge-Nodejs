const mongoose = require('mongoose');

const ledgerEntrySchema = new mongoose.Schema({
  dematAccountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DematAccount',
    required: [true, 'Demat account ID is required'],
    index: true
  },
  tradeTransactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction',
    required: [true, 'Trade transaction ID is required'],
    index: true
  },
  transactionAmount: {
    type: Number,
    required: [true, 'Transaction amount is required'],
    set: value => Math.round(value * 100) / 100 // Round to 2 decimal places
  },
  date: {
    type: Date,
    required: [true, 'Date is required'],
    index: true
  },
  description: {
    type: String,
    trim: true,
    maxlength: [200, 'Description cannot exceed 200 characters']
  },
  transactionType: {
    type: String,
    required: [true, 'Transaction type is required'],
    enum: ['BUY', 'SELL', 'CREDIT', 'DEBIT']
  },
  runningBalance: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Indexes
ledgerEntrySchema.index({ dematAccountId: 1, date: -1 }); // Compound
ledgerEntrySchema.index({ date: -1 });
ledgerEntrySchema.index({ tradeTransactionId: 1 });

module.exports = mongoose.model('LedgerEntry', ledgerEntrySchema);