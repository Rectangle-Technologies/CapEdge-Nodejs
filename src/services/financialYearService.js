const Holdings = require('../models/Holdings');
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
	prevYearDate.setFullYear(prevYearDate.getFullYear() - 1);
	const prevFY = await FinancialYear.findOne({
		startDate: { $lte: prevYearDate },
		endDate: { $gte: prevYearDate }
	}).session(session);

	if (!prevFY) {
		const error = new Error('Previous Financial year for this date does not exist');
		error.statusCode = 404;
		error.reasonCode = 'NOT_FOUND';
		throw error;
	}

	var currentFY = await createFinancialYear({
		date: transactionDate,
		stcgRate: prevFY.stcgRate,
		ltcgRate: prevFY.ltcgRate
	}, session);
	
	const aggregationPipeline = [
		{
			$match: {
				buyDate: {
					$gte: prevFY.startDate,
					$lte: prevFY.endDate
				}
			}
		},
		{
			$group: {
				_id: '$dematAccountId',
				holdings: { $push: '$$ROOT' }
			}
		}
	];

	const holdingsByDematAccount = await Holdings.aggregate(aggregationPipeline).session(session);

	// Build reports map
	const reportsMap = new Map();
	
	for (const record of holdingsByDematAccount) {
		const dematAccountId = record._id.toString();
		const holdings = record.holdings;
		
		// Get previous FY closing balance for this demat account
		const prevReports = prevFY.reports.get(dematAccountId);
		const openingBalance = prevReports ? prevReports.closingBalance : 0;
		
		// Calculate closing balance (opening + current holdings value)
		const closingBalance = holdings.reduce((sum, holding) => {
			return sum + (holding.quantity * holding.price);
		}, openingBalance);
		
		reportsMap.set(dematAccountId, {
			holdings: holdings,
			openingBalance: openingBalance,
			closingBalance: closingBalance
		});
	}
	
	currentFY.reports = reportsMap;
	await currentFY.save({ session });
	
	return currentFY;
};

const  createFinancialYear = async (data, session = null) => {
	const { date, stcgRate, ltcgRate } = data;

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

	const year = date.getFullYear();
	const month = date.getMonth();

	const fyStartYear = month < 3 ? year - 1 : year;

	const financialYear = new FinancialYear({
		startDate: new Date(Date.UTC(fyStartYear, 3, 1, 0, 0, 0, 0)), // April 1st
		endDate: new Date(Date.UTC(fyStartYear + 1, 2, 31, 23, 59, 59, 999)), // March 31st
		stcgRate,
		ltcgRate,
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

	financialYear.stcgRate = data.stcgRate / 100;
	financialYear.ltcgRate = data.ltcgRate / 100;

	await financialYear.save();
	return financialYear;
};

module.exports = {
	getFinancialYears,
	createFinancialYear,
	findOrCreateFinancialYear,
	updateFinancialYear
};