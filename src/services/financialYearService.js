const FinancialYear = require("../models/FinancialYear");

const getFinancialYears = async (filters) => {
  const { date } = filters;
  const query = {};
  
  if (date) {
    const filterDate = new Date(date);
    query.$and = [
      { startDate: { $lte: filterDate } },
      { endDate: { $gte: filterDate } }
    ];
  }
  
  const financialYears = await FinancialYear.find(query).sort({ startDate: -1 });
  return financialYears;
};

const createFinancialYear = async (data) => {
  const { date, stcgRate, ltcgRate } = data;

  console.log(date)

  const existingFinancialYear = await FinancialYear.findOne({
    startDate: { $lte: date },
    endDate: { $gte: date }
  });

  if (existingFinancialYear) {
    const error = new Error('Financial year for this date already exists');
    error.statusCode = 409;
    error.reasonCode = 'ALREADY_EXISTS';
    throw error;
  }

  const financialYear = new FinancialYear({
    startDate: new Date(Date.UTC(date.getFullYear(), 3, 1, 0, 0, 0, 0)), 
    endDate: new Date(Date.UTC(date.getFullYear() + 1, 2, 31, 0, 0, 0, 0)), 
    stcgRate,
    ltcgRate,
    title: `FY ${date.getFullYear()}-${(date.getFullYear() + 1).toString().slice(-2)}`
  });

  await financialYear.save();
  return financialYear;
};

module.exports = {
  getFinancialYears,
  createFinancialYear
};