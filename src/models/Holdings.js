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
  },
  price: {
    type: Number,
    required: [true, 'Buy price is required']
  },
  transactionCost: {
    type: Number,
    default: 0,
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
    unique: true // Each transaction can only have one unmatched record
  },
  dematAccountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DematAccount',
    required: [true, 'Demat account ID is required']
  },
  financialYearId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FinancialYear',
    required: [true, 'Financial year ID is required']
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Holdings', holdingsSchema);
module.exports.holdingsSchema = holdingsSchema;