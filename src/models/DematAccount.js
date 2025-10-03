const mongoose = require('mongoose');

const dematAccountSchema = new mongoose.Schema({
  userAccountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'UserAccount',
    required: [true, 'User account ID is required'],
    index: true
  },
  brokerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Broker',
    required: [true, 'Broker ID is required'],
    index: true
  },
  balance: {
    type: Number,
    required: [true, 'Balance is required'],
    min: [0, 'Balance cannot be negative'],
    set: value => Math.round(value * 100) / 100 // Round to 2 decimal places
  },
  accountNumber: {
    type: String,
    trim: true,
    maxlength: [50, 'Account number cannot exceed 50 characters']
  }
}, {
  timestamps: true
});

// Indexes
dematAccountSchema.index({ userAccountId: 1 });
dematAccountSchema.index({ brokerId: 1 });
// Optional: Enforce unique user-broker combination
dematAccountSchema.index({ userAccountId: 1, brokerId: 1 }, { unique: true });

module.exports = mongoose.model('DematAccount', dematAccountSchema);