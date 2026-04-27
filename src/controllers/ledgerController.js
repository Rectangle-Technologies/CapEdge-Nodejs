const ledgerService = require('../services/ledgerService');
const exportService = require('../services/exportService');
const ApiResponse = require('../utils/response');

const getLedgerEntries = async (req, res, next) => {
  try {
    const filters = {
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      dematAccountId: req.params.dematAccountId,
      transactionType: req.query.transactionType,
      limit: req.query.limit ? parseInt(req.query.limit) : undefined,
      pageNo: req.query.pageNo ? parseInt(req.query.pageNo) : 1,
      sortDirection: 'asc'
    };

    const result = await ledgerService.getLedgerEntries(filters);

    return ApiResponse.success(res, result, 'Ledger entries retrieved successfully');
  } catch (error) {
    next(error);
  }
};

const addLedgerEntry = async (req, res, next) => {
  try {
    const result = await ledgerService.addLedgerEntry(req.body);

    return ApiResponse.created(res, result, 'Ledger entry added successfully');
  } catch (error) {
    next(error);
  }
}

const exportLedger = async (req, res, next) => {
  try {
    const format = req.query.format || 'csv';
    
    const filters = {
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      dematAccountId: req.query.dematAccountId,
      transactionType: req.query.transactionType,
      limit: 10000,
      offset: 0
    };
    
    const result = await ledgerService.getLedgerEntries(filters);
    
    if (format === 'excel') {
      const buffer = await exportService.exportLedgerToExcel(
        result.entries,
        result.summary
      );
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=ledger-report.xlsx');
      res.send(buffer);
    } else {
      const csvData = exportService.prepareLedgerForCSV(result.entries);
      const csv = exportService.exportToCSV(csvData, Object.keys(csvData[0] || {}));
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=ledger-report.csv');
      res.send(csv);
    }
  } catch (error) {
    next(error);
  }
};

const deleteLedgerEntry = async (req, res, next) => {
  try {
    const result = await ledgerService.deleteLedgerEntry(req.params.id);
    return ApiResponse.success(res, result, 'Ledger entry deleted successfully');
  } catch (error) {
    next(error);
  }
};

const fixLedgerEntries = async (req, res, next) => {
  try {
    const result = await ledgerService.fixLedgerEntries(req.body);
    return ApiResponse.success(res, result, 'Ledger entries fixed successfully');
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getLedgerEntries,
  addLedgerEntry,
  deleteLedgerEntry,
  exportLedger,
  fixLedgerEntries
};