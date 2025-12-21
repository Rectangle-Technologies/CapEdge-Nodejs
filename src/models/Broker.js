const mongoose = require('mongoose');

const brokerSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Broker name is required'],
    trim: true,
    maxlength: [100, 'Broker name cannot exceed 100 characters']
  },
  panNumber: {
    type: String,
    uppercase: true,
    trim: true
  },
  address: {
    type: String,
    trim: true,
  }
}, {
  timestamps: true
});

// Indexes
brokerSchema.index({ name: 'text' }); // Text search index

module.exports = mongoose.model('Broker', brokerSchema);