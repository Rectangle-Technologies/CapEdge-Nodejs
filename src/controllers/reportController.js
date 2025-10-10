const { validationResult } = require('express-validator');
const reportService = require('../services/reportService');
const exportService = require('../services/exportService');
const logger = require('../utils/logger');
const ApiResponse = require('../utils/response');

const getPnLReport = async (req, res, next) => {
  try {
    const filters = {
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      capitalGainType: req.query.capitalGainType,
      dematAccountId: req.query.dematAccountId,
      limit: req.query.limit ? parseInt(req.query.limit) : undefined,
      pageNo: req.query.pageNo ? parseInt(req.query.pageNo) : 1
    };
    
    const result = await reportService.getPnLRecords(filters);
    
    return ApiResponse.success(res, result, 'P&L report retrieved successfully');
  } catch (error) {
    next(error);
  }
};

const exportPnLReport = async (req, res, next) => {
  try {
    const format = req.query.format || 'csv';
    
    const filters = {
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      capitalGainType: req.query.capitalGainType,
      dematAccountId: req.query.dematAccountId,
      limit: 10000, // Get all for export
      offset: 0
    };
    
    const result = await reportService.getPnLRecords(filters);
    
    if (format === 'excel') {
      const buffer = await exportService.exportPnLToExcel(
        result.records,
        result.summary
      );
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=pnl-report.xlsx');
      res.send(buffer);
    } else {
      const csvData = exportService.preparePnLForCSV(result.records);
      const csv = exportService.exportToCSV(csvData, Object.keys(csvData[0] || {}));
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=pnl-report.csv');
      res.send(csv);
    }
  } catch (error) {
    next(error);
  }
};

const getHoldingsReport = async (req, res, next) => {
  try {
    const filters = {
      securityName: req.query.securityName,
      securityType: req.query.securityType,
      dematAccountId: req.query.dematAccountId,
      limit: req.query.limit ? parseInt(req.query.limit) : undefined,
      pageNo: req.query.pageNo ? parseInt(req.query.pageNo) : 1
    };
    
    const result = await reportService.getHoldings(filters);
    
    return ApiResponse.success(res, result, 'Holdings report retrieved successfully');
  } catch (error) {
    next(error);
  }
};

const exportHoldingsReport = async (req, res, next) => {
  try {
    const format = req.query.format || 'csv';
    
    const filters = {
      securityName: req.query.securityName,
      securityType: req.query.securityType,
      dematAccountId: req.query.dematAccountId,
      limit: 10000,
      offset: 0
    };
    
    const result = await reportService.getHoldings(filters);
    
    if (format === 'excel') {
      const buffer = await exportService.exportHoldingsToExcel(
        result.holdings,
        result.summary
      );
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=holdings-report.xlsx');
      res.send(buffer);
    } else {
      const csvData = exportService.prepareHoldingsForCSV(result.holdings);
      const csv = exportService.exportToCSV(csvData, Object.keys(csvData[0] || {}));
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=holdings-report.csv');
      res.send(csv);
    }
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getPnLReport,
  exportPnLReport,
  getHoldingsReport,
  exportHoldingsReport
};