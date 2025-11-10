const reportService = require('../services/reportService');
const ApiResponse = require('../utils/response');

const exportPnLReport = async (req, res, next) => {
  try {
    const result = await reportService.getPnLRecords(req.body);
    const exportService = require('../services/exportService');
    const buffer = await exportService.exportToExcel(result, 'PnL_Report.xlsx', 'PnL Report');
    res.setHeader('Content-Disposition', 'attachment; filename="PnL_Report.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return res.send(buffer);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  exportPnLReport,
};