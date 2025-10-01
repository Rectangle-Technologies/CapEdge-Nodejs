const mongoose = require('mongoose');

// UnMatchedRecords represent current holdings (securities bought but not yet sold)
const unmatchedRecordsSchema = new mongoose.Schema({
  buyDate: {
    type: Date,
    required: [true, 'Buy date is required'],
    index: true
  },
  qty: {
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
    required: [true, 'Buy price is required'],
    min: [0.01, 'Price must be greater than 0'],
    set: value => Math.round(value * 100) / 100 // Round to 2 decimal places
  },
  securityId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Security',
    required: [true, 'Security ID is required'],
    index: true
  },
  buyTransactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction',
    required: [true, 'Buy transaction ID is required'],
    index: true,
    unique: true // Each transaction can only have one unmatched record
  },
  dematAccountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DematAccount',
    required: [true, 'Demat account ID is required'],
    index: true
  },
  // Calculated fields for holdings
  totalInvestment: {
    type: Number,
    default: function() {
      return this.qty * this.price;
    }
  },
  currentMarketPrice: {
    type: Number,
    default: 0 // Will be updated from market data
  },
  currentValue: {
    type: Number,
    default: function() {
      return this.qty * (this.currentMarketPrice || this.price);
    }
  },
  unrealizedPnL: {
    type: Number,
    default: function() {
      return this.currentValue - this.totalInvestment;
    }
  }
}, {
  timestamps: true
});

// Indexes
unmatchedRecordsSchema.index({ buyDate: 1 }); // For FIFO sorting
unmatchedRecordsSchema.index({ securityId: 1 });
unmatchedRecordsSchema.index({ dematAccountId: 1 });
unmatchedRecordsSchema.index({ buyTransactionId: 1 });
unmatchedRecordsSchema.index({ securityId: 1, buyDate: 1 }); // Compound for FIFO

// Pre-save middleware to calculate fields
unmatchedRecordsSchema.pre('save', function(next) {
  this.totalInvestment = this.qty * this.price;
  this.currentValue = this.qty * (this.currentMarketPrice || this.price);
  this.unrealizedPnL = this.currentValue - this.totalInvestment;
  next();
});

module.exports = mongoose.model('UnmatchedRecords', unmatchedRecordsSchema);