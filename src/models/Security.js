const mongoose = require('mongoose');

const securityTypes = ['EQUITY', 'FUTURES', 'OPTIONS', 'COMMODITY', 'CURRENCY', 'BOND', 'ETF', 'MUTUAL_FUND'];

const securitySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Security name is required'],
    trim: true,
    minlength: [2, 'Security name must be at least 2 characters long'],
    maxlength: [200, 'Security name cannot exceed 200 characters']
  },
  type: {
    type: String,
    required: [true, 'Security type is required'],
    enum: {
      values: securityTypes,
      message: 'Security type must be one of: ' + securityTypes.join(', ')
    }
  },
  symbol: {
    type: String,
    required: [true, 'Security symbol is required'],
    uppercase: true,
    trim: true,
    maxlength: [50, 'Security symbol cannot exceed 50 characters']
  },
  isin: {
    type: String,
    trim: true,
    uppercase: true,
    match: [/^[A-Z]{2}[A-Z0-9]{10}$/, 'Invalid ISIN format']
  },
  // For derivatives only (OPTIONS, FUTURES)
  strikePrice: {
    type: Number,
    min: [0, 'Strike price must be positive'],
    validate: {
      validator: function(value) {
        const derivativeTypes = ['OPTIONS', 'FUTURES'];
        if (derivativeTypes.includes(this.type)) {
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
        const derivativeTypes = ['OPTIONS', 'FUTURES'];
        if (derivativeTypes.includes(this.type)) {
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