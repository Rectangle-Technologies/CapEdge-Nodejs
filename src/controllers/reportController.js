const reportService = require('../services/reportService');
const ApiResponse = require('../utils/response');
const exportService = require('../services/exportService');
const Security = require('../models/Security');

const getPnLData = async (req, res, next) => {
  try {
    const result = await reportService.getPnLRecords(req.body);
    const { startDate, endDate, ...securitiesData } = result;
    const securityIds = Object.keys(securitiesData);

    const securities = await Security.find({ _id: { $in: securityIds } }).select('name');
    const securityMap = {};
    securities.forEach(sec => { securityMap[sec._id.toString()] = sec.name; });

    const formattedSecurities = securityIds.map(secId => ({
      securityId: secId,
      securityName: securityMap[secId] || 'Unknown',
      transactions: securitiesData[secId]
    }));

    return ApiResponse.success(res, { startDate, endDate, securities: formattedSecurities });
  } catch (error) {
    next(error);
  }
};

const exportPnLReport = async (req, res, next) => {
  try {
    const result = await reportService.getPnLRecords(req.body);
    const buffer = await exportService.exportPnlToExcel(result, 'PnL_Report.xlsx');

    res.setHeader('Content-Disposition', 'attachment; filename="PnL_Report.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    return res.send(buffer);
  } catch (error) {
    next(error);
  }
};

const exportHoldingsReport = async (req, res, next) => {
  try {
    const { financialYearId } = req.query;

    const result = await reportService.getHoldingsRecords(financialYearId);
    const buffer = await exportService.exportHoldingsToExcel(result, 'Holdings_Report.xlsx');

    res.setHeader('Content-Disposition', 'attachment; filename="Holdings_Report.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    return res.send(buffer);
  } catch (error) {
    next(error);
  }
};

const exportLedgerReport = async (req, res, next) => {
  try {
    const { entries, closingBalance } = await reportService.getLedgerRecords(req.params.dematAccountId, req.query);
    const buffer = await exportService.exportLedgerToExcel({
      ledgerEntries: entries, closingBalance, startDate: req.query.startDate, endDate: req.query.endDate
    }, 'Ledger_Report.xlsx');

    res.setHeader('Content-Disposition', 'attachment; filename="Ledger_Report.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    return res.send(buffer);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getPnLData,
  exportPnLReport,
  exportHoldingsReport,
  exportLedgerReport
};