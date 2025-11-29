const reportService = require('../services/reportService');
const ApiResponse = require('../utils/response');
const exportService = require('../services/exportService');

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
    const result = await reportService.getHoldingsRecords();
    const buffer = await exportService.exportHoldingsToExcel(result, 'Holdings_Report.xlsx');
    res.setHeader('Content-Disposition', 'attachment; filename="Holdings_Report.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return res.send(buffer);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  exportPnLReport,
  exportHoldingsReport
};