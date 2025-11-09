const mongoose = require('mongoose');

const transactionTypes = ['BUY', 'SELL'];
const deliveryTypes = ['Delivery', 'Intraday'];

const transactionSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: [true, 'Transaction date is required'],
    // validate: {
    //   validator: function(value) {
    //     return value <= new Date();
    //   },
    //   message: 'Transaction date cannot be in the future'
    // },
  },
  type: {
    type: String,
    required: [true, 'Transaction type is required'],
    enum: {
      values: transactionTypes,
      message: 'Transaction type must be either BUY or SELL'
    }
  },
  quantity: {
    type: Number,
    required: [true, 'Quantity is required']
  },
  price: {
    type: Number,
    required: [true, 'Price is required'],
    set: value => Math.round(value * 100) / 100 // Round to 2 decimal places
  },
  securityId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Security',
    required: [true, 'Security ID is required'],
    index: true
  },
  deliveryType: {
    type: String,
    required: [true, 'Delivery type is required'],
    enum: {
      values: deliveryTypes,
      message: 'Delivery type must be either Delivery or Intraday'
    },
  },
  referenceNumber: {
    type: String,
    trim: true
  },
  dematAccountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DematAccount',
    required: [true, 'Demat account ID is required'],
    index: true
  },
  financialYearId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FinancialYear',
    required: [true, 'Financial year ID is required']
  },
  buyTransactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction',
    default: null
  }
}, {
  timestamps: true
});

// Indexes
transactionSchema.index({ securityId: 1 });
transactionSchema.index({ dematAccountId: 1 });
transactionSchema.index({ financialYearId: 1 });

module.exports = mongoose.model('Transaction', transactionSchema);