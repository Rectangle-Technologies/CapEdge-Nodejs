const mongoose = require('mongoose');
const { SECURITY_TYPES_ARRAY, DERIVATIVE_TYPES } = require('../constants');

// Schema for split history records
const splitHistorySchema = new mongoose.Schema({
  splitDate: {
    type: Date,
    required: true
  },
  splitRatio: {
    type: String, // e.g., "1:2" means 1 old share becomes 2 new shares
    required: true
  },
  transactions: [{
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction',
      required: true
    },
    quantityBeforeSplit: {
      type: Number,
      required: true
    },
    quantityAfterSplit: {
      type: Number,
      required: true
    },
    priceBeforeSplit: {
      type: Number,
      required: true
    },
    priceAfterSplit: {
      type: Number,
      required: true
    }
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { _id: true });

const securitySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Security name is required'],
    trim: true,
    maxlength: [200, 'Security name cannot exceed 200 characters']
  },
  type: {
    type: String,
    required: [true, 'Security type is required'],
    enum: {
      values: SECURITY_TYPES_ARRAY,
      message: 'Security type must be one of: ' + SECURITY_TYPES_ARRAY.join(', ')
    }
  },
  splitHistory: [splitHistorySchema],
  strikePrice: {
    type: Number,
    min: [0, 'Strike price must be positive'],
    validate: {
      validator: function(value) {
        if (DERIVATIVE_TYPES.includes(this.type)) {
          return value != null && value > 0;
        }
        return value == null;
      },
      message: 'Strike price is required for derivatives and must be null for non-derivatives'
    }
  },
  expiry: {
    type: Date,
    validate: {
      validator: function(value) {
        if (DERIVATIVE_TYPES.includes(this.type)) {
          return value != null && value > new Date();
        }
        return value == null;
      },
      message: 'Expiry date is required for derivatives, must be in future, and must be null for non-derivatives'
    }
  }
}, {
  timestamps: true
});

// Indexes
securitySchema.index({ name: 'text' });
securitySchema.index({ symbol: 1, stockExchangeId: 1 });

// Compound index for symbol uniqueness within exchange
securitySchema.index({ symbol: 1, stockExchangeId: 1 }, { unique: true });

module.exports = mongoose.model('Security', securitySchema);