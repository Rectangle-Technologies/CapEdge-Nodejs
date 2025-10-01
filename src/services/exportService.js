const { Parser } = require('json2csv');
const ExcelJS = require('exceljs');
const logger = require('../utils/logger');

/**
 * Export Service
 * Handles data export to CSV and Excel formats
 */

/**
 * Export data to CSV format
 * @param {Array} data - Array of objects to export
 * @param {Array} fields - Fields configuration for CSV columns
 * @returns {String} - CSV string
 */
const exportToCSV = (data, fields) => {
  try {
    const json2csvParser = new Parser({ fields });
    const csv = json2csvParser.parse(data);
    return csv;
  } catch (error) {
    logger.error('Error in exportToCSV:', error);
    throw error;
  }
};

/**
 * Export P&L report to Excel format
 * @param {Array} records - P&L records
 * @param {Object} summary - Summary statistics
 * @returns {Promise<Buffer>} - Excel file buffer
 */
const exportPnLToExcel = async (records, summary) => {
  try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('P&L Report');

    // Add title
    worksheet.mergeCells('A1:M1');
    worksheet.getCell('A1').value = 'Profit & Loss Report';
    worksheet.getCell('A1').font = { size: 16, bold: true };
    worksheet.getCell('A1').alignment = { horizontal: 'center' };

    // Add generation date
    worksheet.mergeCells('A2:M2');
    worksheet.getCell('A2').value = `Generated on: ${new Date().toLocaleString()}`;
    worksheet.getCell('A2').alignment = { horizontal: 'center' };

    // Add summary section
    worksheet.addRow([]);
    worksheet.addRow(['Summary']);
    worksheet.getCell('A4').font = { bold: true, size: 12 };
    
    worksheet.addRow(['Total Profit:', summary.totalProfit || 0]);
    worksheet.addRow(['Total Loss:', summary.totalLoss || 0]);
    worksheet.addRow(['Net Profit/Loss:', summary.netProfitLoss || 0]);
    worksheet.addRow(['Total Trades:', summary.totalTrades || 0]);
    worksheet.addRow(['STCG Count:', summary.stcgCount || 0]);
    worksheet.addRow(['LTCG Count:', summary.ltcgCount || 0]);
    worksheet.addRow(['STCG P&L:', summary.stcgProfitLoss || 0]);
    worksheet.addRow(['LTCG P&L:', summary.ltcgProfitLoss || 0]);

    // Add space before data
    worksheet.addRow([]);
    worksheet.addRow([]);

    // Define columns
    worksheet.columns = [
      { header: 'Buy Date', key: 'buyDate', width: 12 },
      { header: 'Sell Date', key: 'sellDate', width: 12 },
      { header: 'Security', key: 'security', width: 25 },
      { header: 'Exchange', key: 'exchange', width: 12 },
      { header: 'Quantity', key: 'quantity', width: 10 },
      { header: 'Buy Price', key: 'buyPrice', width: 12 },
      { header: 'Sell Price', key: 'sellPrice', width: 12 },
      { header: 'Profit/Loss', key: 'profitLoss', width: 12 },
      { header: 'Capital Gain', key: 'capitalGainType', width: 12 },
      { header: 'Holding Period', key: 'holdingPeriod', width: 15 },
      { header: 'User', key: 'user', width: 20 },
      { header: 'Broker', key: 'broker', width: 20 },
      { header: 'Type', key: 'type', width: 10 }
    ];

    // Style header row
    const headerRow = worksheet.getRow(14);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD3D3D3' }
    };

    // Add data rows
    records.forEach(record => {
      worksheet.addRow({
        buyDate: new Date(record.buyDate).toLocaleDateString(),
        sellDate: new Date(record.sellDate).toLocaleDateString(),
        security: record.security?.name || 'N/A',
        exchange: record.stockExchange?.code || 'N/A',
        quantity: record.quantity,
        buyPrice: record.buyPrice,
        sellPrice: record.sellPrice,
        profitLoss: record.profitLoss,
        capitalGainType: record.capitalGainType,
        holdingPeriod: `${Math.floor(record.holdingPeriod)} days`,
        user: record.userAccount?.name || 'N/A',
        broker: record.broker?.name || 'N/A',
        type: record.security?.type || 'N/A'
      });
    });

    // Auto-filter
    worksheet.autoFilter = {
      from: 'A14',
      to: 'M14'
    };

    // Format number columns
    worksheet.getColumn('buyPrice').numFmt = '₹#,##0.00';
    worksheet.getColumn('sellPrice').numFmt = '₹#,##0.00';
    worksheet.getColumn('profitLoss').numFmt = '₹#,##0.00';

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();
    return buffer;
  } catch (error) {
    logger.error('Error in exportPnLToExcel:', error);
    throw error;
  }
};

/**
 * Export Holdings report to Excel format
 * @param {Array} holdings - Holdings records
 * @param {Object} summary - Summary statistics
 * @returns {Promise<Buffer>} - Excel file buffer
 */
const exportHoldingsToExcel = async (holdings, summary) => {
  try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Holdings Report');

    // Add title
    worksheet.mergeCells('A1:K1');
    worksheet.getCell('A1').value = 'Current Holdings Report';
    worksheet.getCell('A1').font = { size: 16, bold: true };
    worksheet.getCell('A1').alignment = { horizontal: 'center' };

    // Add generation date
    worksheet.mergeCells('A2:K2');
    worksheet.getCell('A2').value = `Generated on: ${new Date().toLocaleString()}`;
    worksheet.getCell('A2').alignment = { horizontal: 'center' };

    // Add summary section
    worksheet.addRow([]);
    worksheet.addRow(['Portfolio Summary']);
    worksheet.getCell('A4').font = { bold: true, size: 12 };
    
    worksheet.addRow(['Total Investment:', summary.totalInvestment || 0]);
    worksheet.addRow(['Current Value:', summary.totalCurrentValue || 0]);
    worksheet.addRow(['Unrealized P&L:', summary.totalUnrealizedPnL || 0]);
    worksheet.addRow(['Portfolio Return:', `${summary.portfolioReturn || 0}%`]);
    worksheet.addRow(['Total Holdings:', summary.totalHoldings || 0]);
    worksheet.addRow(['Total Quantity:', summary.totalQuantity || 0]);

    // Add space before data
    worksheet.addRow([]);
    worksheet.addRow([]);

    // Define columns
    worksheet.columns = [
      { header: 'Buy Date', key: 'buyDate', width: 12 },
      { header: 'Security', key: 'security', width: 25 },
      { header: 'Exchange', key: 'exchange', width: 12 },
      { header: 'Quantity', key: 'quantity', width: 10 },
      { header: 'Buy Price', key: 'buyPrice', width: 12 },
      { header: 'Investment', key: 'investment', width: 15 },
      { header: 'Current Price', key: 'currentPrice', width: 12 },
      { header: 'Current Value', key: 'currentValue', width: 15 },
      { header: 'Unrealized P&L', key: 'unrealizedPnL', width: 15 },
      { header: 'P&L %', key: 'pnlPercentage', width: 10 },
      { header: 'Holding Days', key: 'holdingDays', width: 12 },
      { header: 'User', key: 'user', width: 20 },
      { header: 'Broker', key: 'broker', width: 20 },
      { header: 'Type', key: 'type', width: 10 }
    ];

    // Style header row
    const headerRow = worksheet.getRow(12);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD3D3D3' }
    };

    // Add data rows
    holdings.forEach(holding => {
      worksheet.addRow({
        buyDate: new Date(holding.buyDate).toLocaleDateString(),
        security: holding.security?.name || 'N/A',
        exchange: holding.stockExchange?.code || 'N/A',
        quantity: holding.quantity,
        buyPrice: holding.buyPrice,
        investment: holding.totalInvestment,
        currentPrice: holding.currentMarketPrice || holding.buyPrice,
        currentValue: holding.currentValue,
        unrealizedPnL: holding.unrealizedPnL,
        pnlPercentage: `${holding.pnlPercentage}%`,
        holdingDays: holding.holdingDays,
        user: holding.userAccount?.name || 'N/A',
        broker: holding.broker?.name || 'N/A',
        type: holding.security?.type || 'N/A'
      });
    });

    // Auto-filter
    worksheet.autoFilter = {
      from: 'A12',
      to: 'N12'
    };

    // Format number columns
    worksheet.getColumn('buyPrice').numFmt = '₹#,##0.00';
    worksheet.getColumn('investment').numFmt = '₹#,##0.00';
    worksheet.getColumn('currentPrice').numFmt = '₹#,##0.00';
    worksheet.getColumn('currentValue').numFmt = '₹#,##0.00';
    worksheet.getColumn('unrealizedPnL').numFmt = '₹#,##0.00';

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();
    return buffer;
  } catch (error) {
    logger.error('Error in exportHoldingsToExcel:', error);
    throw error;
  }
};

/**
 * Export Ledger report to Excel format
 * @param {Array} entries - Ledger entries
 * @param {Object} summary - Summary statistics
 * @returns {Promise<Buffer>} - Excel file buffer
 */
const exportLedgerToExcel = async (entries, summary) => {
  try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Ledger');

    // Add title
    worksheet.mergeCells('A1:J1');
    worksheet.getCell('A1').value = 'Ledger Report';
    worksheet.getCell('A1').font = { size: 16, bold: true };
    worksheet.getCell('A1').alignment = { horizontal: 'center' };

    // Add generation date
    worksheet.mergeCells('A2:J2');
    worksheet.getCell('A2').value = `Generated on: ${new Date().toLocaleString()}`;
    worksheet.getCell('A2').alignment = { horizontal: 'center' };

    // Add summary section
    worksheet.addRow([]);
    worksheet.addRow(['Summary']);
    worksheet.getCell('A4').font = { bold: true, size: 12 };
    
    worksheet.addRow(['Total Debits:', summary.totalDebits || 0]);
    worksheet.addRow(['Total Credits:', summary.totalCredits || 0]);
    worksheet.addRow(['Net Amount:', summary.netAmount || 0]);
    worksheet.addRow(['Total Entries:', summary.totalEntries || 0]);
    if (summary.currentBalance !== undefined) {
      worksheet.addRow(['Current Balance:', summary.currentBalance]);
    }

    // Add space before data
    worksheet.addRow([]);
    worksheet.addRow([]);

    // Define columns
    worksheet.columns = [
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Type', key: 'type', width: 10 },
      { header: 'Amount', key: 'amount', width: 15 },
      { header: 'Running Balance', key: 'runningBalance', width: 15 },
      { header: 'Security', key: 'security', width: 25 },
      { header: 'Quantity', key: 'quantity', width: 10 },
      { header: 'Price', key: 'price', width: 12 },
      { header: 'Transaction Type', key: 'transactionType', width: 15 },
      { header: 'User', key: 'user', width: 20 },
      { header: 'Broker', key: 'broker', width: 20 }
    ];

    // Style header row
    const headerRowIndex = summary.currentBalance !== undefined ? 11 : 10;
    const headerRow = worksheet.getRow(headerRowIndex);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD3D3D3' }
    };

    // Add data rows
    entries.forEach(entry => {
      worksheet.addRow({
        date: new Date(entry.date).toLocaleDateString(),
        type: entry.transactionType,
        amount: entry.amount,
        runningBalance: entry.runningBalance || 0,
        security: entry.security?.name || 'N/A',
        quantity: entry.transaction?.quantity || 'N/A',
        price: entry.transaction?.price || 'N/A',
        transactionType: entry.transaction?.type || 'N/A',
        user: entry.userAccount?.name || 'N/A',
        broker: entry.broker?.name || 'N/A'
      });
    });

    // Auto-filter
    worksheet.autoFilter = {
      from: `A${headerRowIndex}`,
      to: `J${headerRowIndex}`
    };

    // Format number columns
    worksheet.getColumn('amount').numFmt = '₹#,##0.00';
    worksheet.getColumn('runningBalance').numFmt = '₹#,##0.00';
    worksheet.getColumn('price').numFmt = '₹#,##0.00';

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();
    return buffer;
  } catch (error) {
    logger.error('Error in exportLedgerToExcel:', error);
    throw error;
  }
};

/**
 * Prepare P&L data for CSV export
 * @param {Array} records - P&L records
 * @returns {Array} - Formatted data for CSV
 */
const preparePnLForCSV = (records) => {
  return records.map(record => ({
    'Buy Date': new Date(record.buyDate).toLocaleDateString(),
    'Sell Date': new Date(record.sellDate).toLocaleDateString(),
    'Security': record.security?.name || 'N/A',
    'Exchange': record.stockExchange?.code || 'N/A',
    'Quantity': record.quantity,
    'Buy Price': record.buyPrice,
    'Sell Price': record.sellPrice,
    'Profit/Loss': record.profitLoss,
    'Capital Gain Type': record.capitalGainType,
    'Holding Period (Days)': Math.floor(record.holdingPeriod),
    'User': record.userAccount?.name || 'N/A',
    'Broker': record.broker?.name || 'N/A',
    'Security Type': record.security?.type || 'N/A'
  }));
};

/**
 * Prepare Holdings data for CSV export
 * @param {Array} holdings - Holdings records
 * @returns {Array} - Formatted data for CSV
 */
const prepareHoldingsForCSV = (holdings) => {
  return holdings.map(holding => ({
    'Buy Date': new Date(holding.buyDate).toLocaleDateString(),
    'Security': holding.security?.name || 'N/A',
    'Exchange': holding.stockExchange?.code || 'N/A',
    'Quantity': holding.quantity,
    'Buy Price': holding.buyPrice,
    'Total Investment': holding.totalInvestment,
    'Current Price': holding.currentMarketPrice || holding.buyPrice,
    'Current Value': holding.currentValue,
    'Unrealized P&L': holding.unrealizedPnL,
    'P&L Percentage': `${holding.pnlPercentage}%`,
    'Holding Days': holding.holdingDays,
    'User': holding.userAccount?.name || 'N/A',
    'Broker': holding.broker?.name || 'N/A',
    'Security Type': holding.security?.type || 'N/A'
  }));
};

/**
 * Prepare Ledger data for CSV export
 * @param {Array} entries - Ledger entries
 * @returns {Array} - Formatted data for CSV
 */
const prepareLedgerForCSV = (entries) => {
  return entries.map(entry => ({
    'Date': new Date(entry.date).toLocaleDateString(),
    'Type': entry.transactionType,
    'Amount': entry.amount,
    'Running Balance': entry.runningBalance || 0,
    'Security': entry.security?.name || 'N/A',
    'Quantity': entry.transaction?.quantity || 'N/A',
    'Price': entry.transaction?.price || 'N/A',
    'Transaction Type': entry.transaction?.type || 'N/A',
    'User': entry.userAccount?.name || 'N/A',
    'Broker': entry.broker?.name || 'N/A'
  }));
};

module.exports = {
  exportToCSV,
  exportPnLToExcel,
  exportHoldingsToExcel,
  exportLedgerToExcel,
  preparePnLForCSV,
  prepareHoldingsForCSV,
  prepareLedgerForCSV
};
