const mongoose = require('mongoose');

const transactionTypes = ['BUY', 'SELL'];
const deliveryTypes = ['Delivery', 'Intraday'];

const transactionSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: [true, 'Transaction date is required'],
    validate: {
      validator: function(value) {
        return value <= new Date();
      },
      message: 'Transaction date cannot be in the future'
    },
    index: true
  },
  type: {
    type: String,
    required: [true, 'Transaction type is required'],
    enum: {
      values: transactionTypes,
      message: 'Transaction type must be either BUY or SELL'
    },
    index: true
  },
  quantity: {
    type: Number,
    required: [true, 'Quantity is required'],
    min: [1, 'Quantity must be at least 1'],
    validate: {
      validator: Number.isInteger,
      message: 'Quantity must be an integer'
    }
  },
  price: {
    type: Number,
    required: [true, 'Price is required'],
    min: [0.01, 'Price must be greater than 0'],
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
    index: true
  },
  referenceNumber: {
    type: String,
    trim: true,
    maxlength: [100, 'Reference number cannot exceed 100 characters']
  },
  dematAccountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DematAccount',
    required: [true, 'Demat account ID is required'],
    index: true
  },
  // Calculated field for transaction value
  transactionValue: {
    type: Number,
    default: function() {
      return this.quantity * this.price;
    }
  }
}, {
  timestamps: true
});

// Indexes
transactionSchema.index({ date: -1 }); // Descending for recent first
transactionSchema.index({ type: 1 });
transactionSchema.index({ securityId: 1 });
transactionSchema.index({ dematAccountId: 1 });
transactionSchema.index({ deliveryType: 1 });
// Compound indexes for common queries
transactionSchema.index({ date: 1, type: 1, securityId: 1 });
transactionSchema.index({ dematAccountId: 1, date: -1 });

// Pre-save middleware to calculate transaction value
transactionSchema.pre('save', function(next) {
  this.transactionValue = this.quantity * this.price;
  next();
});

module.exports = mongoose.model('Transaction', transactionSchema);