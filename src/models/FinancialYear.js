const mongoose = require('mongoose');

const financialYearSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Financial year title is required'],
    trim: true,
    maxlength: [50, 'Title cannot exceed 50 characters']
  },
  startDate: {
    type: Date,
    required: [true, 'Start date is required'],
    index: true
  },
  endDate: {
    type: Date,
    required: [true, 'End date is required'],
    validate: {
      validator: function(value) {
        return value > this.startDate;
      },
      message: 'End date must be after start date'
    }
  },
  stcgRate: {
    type: Number,
    required: [true, 'STCG rate is required'],
    min: [0, 'STCG rate cannot be negative'],
    max: [100, 'STCG rate cannot exceed 100%'],
    set: value => value / 100 // Store as decimal (e.g., 15% as 0.15)
  },
  ltcgRate: {
    type: Number,
    required: [true, 'LTCG rate is required'],
    min: [0, 'LTCG rate cannot be negative'],
    max: [100, 'LTCG rate cannot exceed 100%'],
    set: value => value / 100 // Store as decimal (e.g., 10% as 0.10)
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes
financialYearSchema.index({ startDate: -1 });
financialYearSchema.index({ startDate: 1, lastDate: 1 }); // For overlap checks

// Validation to prevent overlapping financial years
financialYearSchema.pre('save', async function(next) {
  const overlap = await this.constructor.findOne({
    _id: { $ne: this._id },
    $or: [
      {
        startDate: { $lte: this.startDate },
        lastDate: { $gte: this.startDate }
      },
      {
        startDate: { $lte: this.lastDate },
        lastDate: { $gte: this.lastDate }
      },
      {
        startDate: { $gte: this.startDate },
        lastDate: { $lte: this.lastDate }
      }
    ]
  });

  if (overlap) {
    const error = new Error('Financial year dates overlap with existing financial year');
    error.name = 'ValidationError';
    return next(error);
  }

  next();
});

module.exports = mongoose.model('FinancialYear', financialYearSchema);