const mongoose = require('mongoose');
const { holdingsSchema } = require('./Holdings');

const reportSchema = new mongoose.Schema({
  holdings: [holdingsSchema],
  openingBalance: {
    type: Number,
    required: [true, 'Opening balance is required'],
    set: value => Math.round(value * 100) / 100 // Round to 2 decimal places
  },
  closingBalance: {
    type: Number,
    required: [true, 'Closing balance is required'],
    set: value => Math.round(value * 100) / 100 // Round to 2 decimal places
  }
})

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
      validator: function (value) {
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
  reports: {
    type: Map,
    of: reportSchema,
    default: {}
  }
}, {
  timestamps: true
});

// Indexes
financialYearSchema.index({ startDate: -1 });
financialYearSchema.index({ startDate: 1, endDate: 1 }); // For overlap checks


module.exports = mongoose.model('FinancialYear', financialYearSchema);