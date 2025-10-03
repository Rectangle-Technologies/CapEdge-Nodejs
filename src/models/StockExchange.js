const mongoose = require('mongoose');

const stockExchangeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Stock exchange name is required'],
    trim: true,
    maxlength: [100, 'Stock exchange name cannot exceed 100 characters']
  },
  code: {
    type: String,
    required: [true, 'Stock exchange code is required'],
    unique: true,
    uppercase: true,
    trim: true,
    maxlength: [10, 'Stock exchange code cannot exceed 10 characters']
  },
  country: {
    type: String,
    required: [true, 'Country is required'],
    trim: true,
    default: 'India'
  }
}, {
  timestamps: true
});

// Indexes
stockExchangeSchema.index({ code: 1 }, { unique: true });
stockExchangeSchema.index({ name: 'text' });

module.exports = mongoose.model('StockExchange', stockExchangeSchema);