const Holdings = require('../models/Holdings');
const FinancialYear = require("../models/FinancialYear");
const DematAccount = require('../models/DematAccount');

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


/**
 * Find existing Financial Year or create a new one for the transaction date
 * @private
 */
const findOrCreateFinancialYear = async (transactionDate, session) => {
	// Find FY that contains this date
	let financialYear = await FinancialYear.findOne({
		startDate: { $lte: transactionDate },
		endDate: { $gte: transactionDate }
	}).session(session);

	if (!!financialYear) {
		return financialYear;
	}

	// Check if prev FY exists
	const prevYearDate = new Date(transactionDate);
	prevYearDate.setUTCFullYear(prevYearDate.getUTCFullYear() - 1); // UTC: stay on the same calendar day a year earlier
	const prevFY = await FinancialYear.findOne({
		startDate: { $lte: prevYearDate },
		endDate: { $gte: prevYearDate }
	}).session(session);

	if (!prevFY) {
		const prevDateStr = prevYearDate.toISOString().slice(0, 10);
		console.error(`[findOrCreateFinancialYear] no prev FY for date=${new Date(transactionDate).toISOString().slice(0,10)} (looking for FY containing ${prevDateStr})`);
		const error = new Error('Cannot process this transaction — its date falls before the earliest configured financial year. Please add the missing financial year first and try again.');
		error.statusCode = 404;
		error.reasonCode = 'NOT_FOUND';
		throw error;
	}

	var currentFY = await createFinancialYear({
		date: transactionDate,
		stcgRate: prevFY.stcgRate,
		ltcgRate: prevFY.ltcgRate,
		intradayRate: prevFY.intradayRate
	}, session);
	
	// Save the current holdings and balance in the previous FY report
	const dematAccounts = await DematAccount.find().session(session);
	
	// Fetch all holdings for the previous FY in a single query
	const allHoldings = await Holdings.find({
		financialYearId: prevFY._id
	}).session(session);
	
	// Group holdings by dematAccountId for efficient lookup
	const holdingsByAccount = allHoldings.reduce((acc, holding) => {
		const accountId = holding.dematAccountId.toString();
		if (!acc[accountId]) {
			acc[accountId] = [];
		}
		acc[accountId].push(holding);
		return acc;
	}, {});
	
	// Update reports for all demat accounts
	for (const dematAccount of dematAccounts) {
		const accountId = dematAccount._id.toString();
		const holdings = holdingsByAccount[accountId] || [];
		
		const prevReport = prevFY.reports.get(accountId) || {
			holdings: [],
			openingBalance: 0,
			closingBalance: 0
		};

		prevReport.closingBalance = dematAccount.balance;
		prevReport.holdings = holdings;

		prevFY.reports.set(accountId, prevReport);
	}
	
	// Save once after all updates
	await prevFY.save({ session });
	
	return currentFY;
};

const  createFinancialYear = async (data, session = null) => {
	const { date, stcgRate, ltcgRate, intradayRate } = data;

	const existingFinancialYear = await FinancialYear.findOne({
		startDate: { $lte: date },
		endDate: { $gte: date }
	}).session(session);

	if (existingFinancialYear) {
		const error = new Error('Financial year for this date already exists');
		error.statusCode = 409;
		error.reasonCode = 'ALREADY_EXISTS';
		throw error;
	}

	// UTC parts: derive the FY from the date's UTC calendar day (timezone-independent)
	const year = date.getUTCFullYear();
	const month = date.getUTCMonth();

	const fyStartYear = month < 3 ? year - 1 : year;

	const financialYear = new FinancialYear({
		// start/end → UTC midnight / end-of-day via FinancialYear model setters
		startDate: new Date(Date.UTC(fyStartYear, 3, 1, 0, 0, 0, 0)), // April 1st
		endDate: new Date(Date.UTC(fyStartYear + 1, 2, 31, 23, 59, 59, 999)), // March 31st
		stcgRate: stcgRate,
		ltcgRate: ltcgRate,
		intradayRate: intradayRate,
		title: `FY ${fyStartYear}-${(fyStartYear + 1).toString().slice(-2)}`
	});
	await financialYear.save({ session });

	return financialYear;
};

const updateFinancialYear = async (id, data) => {
	const financialYear = await FinancialYear.findById(id);
	if (!financialYear) {
		const error = new Error('Financial year not found');
		error.statusCode = 404;
		error.reasonCode = 'NOT_FOUND';
		throw error;
	}

	// start/end → UTC midnight / end-of-day via FinancialYear model setters
	financialYear.startDate = data.startDate;
	financialYear.endDate = data.endDate;
	financialYear.stcgRate = data.stcgRate / 100;
	financialYear.ltcgRate = data.ltcgRate / 100;
	financialYear.intradayRate = data.intradayRate / 100;

	await financialYear.save();
	return financialYear;
};

module.exports = {
	getFinancialYears,
	createFinancialYear,
	findOrCreateFinancialYear,
	updateFinancialYear
};