const mongoose = require('mongoose');

const userAccountSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'User account name is required'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  panNumber: {
    type: String,
    required: [true, 'PAN number is required'],
    unique: true,
    uppercase: true,
    match: [/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, 'Invalid PAN number format. Format: ABCDE1234F']
  },
  address: {
    type: String,
    required: [true, 'Address is required'],
    trim: true,
    maxlength: [500, 'Address cannot exceed 500 characters']
  }
}, {
  timestamps: true
});

// Indexes
userAccountSchema.index({ panNumber: 1 }, { unique: true });
userAccountSchema.index({ name: 'text' });

module.exports = mongoose.model('UserAccount', userAccountSchema);