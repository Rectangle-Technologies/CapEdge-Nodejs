const mongoose = require('mongoose');

const brokerSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Broker name is required'],
    trim: true,
    minlength: [2, 'Broker name must be at least 2 characters long'],
    maxlength: [100, 'Broker name cannot exceed 100 characters']
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
    minlength: [10, 'Address must be at least 10 characters long'],
    maxlength: [500, 'Address cannot exceed 500 characters']
  }
}, {
  timestamps: true
});

// Indexes
brokerSchema.index({ panNumber: 1 }, { unique: true });
brokerSchema.index({ name: 'text' }); // Text search index

module.exports = mongoose.model('Broker', brokerSchema);