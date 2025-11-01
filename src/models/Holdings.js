const mongoose = require('mongoose');

// Holdings represent current holdings (securities bought but not yet sold)
const holdingsSchema = new mongoose.Schema({
  buyDate: {
    type: Date,
    required: [true, 'Buy date is required']
  },
  quantity: {
    type: Number,
    required: [true, 'Quantity is required'],
    validate: {
      validator: Number.isInteger,
      message: 'Quantity must be an integer'
    }
  },
  price: {
    type: Number,
    required: [true, 'Buy price is required'],
    set: value => Math.round(value * 100) / 100 // Round to 2 decimal places
  },
  securityId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Security',
    required: [true, 'Security ID is required']
  },
  transactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction',
    required: [true, 'Transaction ID is required'],
    index: true,
    unique: true // Each transaction can only have one unmatched record
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
    required: [true, 'Financial year ID is required'],
    index: true
  }
}, {
  timestamps: true
});

// Indexes
holdingsSchema.index({ dematAccountId: 1 });
holdingsSchema.index({ transactionId: 1 });

module.exports = mongoose.model('Holdings', holdingsSchema);
module.exports.holdingsSchema = holdingsSchema;