const mongoose = require('mongoose');

const capitalGainTypes = ['STCG', 'LTCG'];

const matchedRecordsSchema = new mongoose.Schema({
  buyDate: {
    type: Date,
    required: [true, 'Buy date is required'],
    index: true
  },
  sellDate: {
    type: Date,
    required: [true, 'Sell date is required'],
    index: true
  },
  securityId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Security',
    required: [true, 'Security ID is required'],
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
  buyPrice: {
    type: Number,
    required: [true, 'Buy price is required'],
    min: [0.01, 'Buy price must be greater than 0']
  },
  sellPrice: {
    type: Number,
    required: [true, 'Sell price is required'],
    min: [0.01, 'Sell price must be greater than 0']
  },
  buyTransactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction',
    required: [true, 'Buy transaction ID is required'],
    index: true
  },
  sellTransactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction',
    required: [true, 'Sell transaction ID is required'],
    index: true
  },
  capitalGainType: {
    type: String,
    required: [true, 'Capital gain type is required'],
    enum: {
      values: capitalGainTypes,
      message: 'Capital gain type must be either STCG or LTCG'
    },
    index: true
  },
  profitAndLoss: {
    type: Number,
    required: [true, 'Profit and loss is required']
  },
  deliveryType: {
    type: String,
    required: [true, 'Delivery type is required'],
    enum: ['Delivery', 'Intraday']
  },
  dematAccountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DematAccount',
    required: [true, 'Demat account ID is required'],
    index: true
  },
  holdingPeriod: {
    type: Number, // Days
    required: [true, 'Holding period is required']
  }
}, {
  timestamps: true
});

// Indexes
matchedRecordsSchema.index({ sellDate: -1 });
matchedRecordsSchema.index({ buyDate: 1 });
matchedRecordsSchema.index({ capitalGainType: 1 });
matchedRecordsSchema.index({ securityId: 1 });
matchedRecordsSchema.index({ dematAccountId: 1 });
matchedRecordsSchema.index({ buyTransactionId: 1 });
matchedRecordsSchema.index({ sellTransactionId: 1 });
matchedRecordsSchema.index({ sellDate: 1, capitalGainType: 1 }); // Compound

// Pre-save middleware to calculate P&L and holding period
matchedRecordsSchema.pre('save', function(next) {
  this.profitAndLoss = (this.sellPrice - this.buyPrice) * this.qty;
  
  // Calculate holding period in days
  const timeDiff = this.sellDate.getTime() - this.buyDate.getTime();
  this.holdingPeriod = Math.ceil(timeDiff / (1000 * 3600 * 24));
  
  next();
});

module.exports = mongoose.model('MatchedRecords', matchedRecordsSchema);