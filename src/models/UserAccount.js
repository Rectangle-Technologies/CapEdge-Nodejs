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
    uppercase: true,
    trim: true,
  },
  address: {
    type: String,
    trim: true,
  }
}, {
  timestamps: true
});

// Indexes
userAccountSchema.index({ panNumber: 1 }, { unique: true });
userAccountSchema.index({ name: 'text' });

module.exports = mongoose.model('UserAccount', userAccountSchema);