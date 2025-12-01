const ExcelJS = require('exceljs');
const logger = require('../utils/logger');
const Security = require('../models/Security');

const exportPnlToExcel = async (data, sheetName) => {
  const { startDate, endDate, ...securitiesData } = data;
  const securityIds = Object.keys(securitiesData);
  const securities = await Security.find({ _id: { $in: securityIds } }).select('name');
  const securityMap = {};
  securities.forEach(sec => {
    securityMap[sec._id.toString()] = sec.name;
  });

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);

  // Helper to format date as dd/mm/yy using regex
  const formatDate = (date) => {
    if (!date) return '';
    const isoString = date.toISOString();
    const formattedDate = isoString.replace(/^(\d{4})-(\d{2})-(\d{2}).*/, '$3/$2/$1');
    return formattedDate;
  };
  worksheet.mergeCells('A1:O1');
  worksheet.getCell('A1').value = `Period from: ${formatDate(startDate)} to ${formatDate(endDate)}`;
  worksheet.getCell('A3').value = 'Stock';
  worksheet.mergeCells('B3:E3'); worksheet.getCell('B3').value = 'Buy';
  worksheet.mergeCells('F3:I3'); worksheet.getCell('F3').value = 'Sell';
  worksheet.mergeCells('J3:K3'); worksheet.getCell('J3').value = 'Gain';
  worksheet.mergeCells('L3:M3'); worksheet.getCell('L3').value = 'Loss';
  worksheet.mergeCells('N3:O3'); worksheet.getCell('N3').value = 'Tax';
  worksheet.getRow(4).values = [
    '', 'Date', 'Quantity', 'Price', 'Amount', 'Date', 'Quantity', 'Price', 'Amount', 'Long Term', 'Short Term', 'Long Term', 'Short Term', 'Long Term', 'Short Term'
  ];

  // Set column widths
  worksheet.columns = [
    { key: 'A', width: 20 }, // Stock
    { key: 'B', width: 10 }, // Buy Date
    { key: 'C', width: 8 }, // Buy Quantity
    { key: 'D', width: 15 }, // Buy Price
    { key: 'E', width: 15 }, // Buy Amount
    { key: 'F', width: 10 }, // Sell Date
    { key: 'G', width: 8 }, // Sell Quantity
    { key: 'H', width: 15 }, // Sell Price
    { key: 'I', width: 15 }, // Sell Amount
    { key: 'J', width: 15 }, // Gain Long Term
    { key: 'K', width: 15 }, // Gain Short Term
    { key: 'L', width: 15 }, // Loss Long Term
    { key: 'M', width: 15 }, // Loss Short Term
    { key: 'N', width: 15 }, // Tax Long Term
    { key: 'O', width: 15 }, // Tax Short Term
  ];

  // INR Currency format
  const inrFormat = '₹#,##0.00';

  let totalBuyAmount = 0;
  let totalSellAmount = 0;
  let totalGainLong = 0;
  let totalGainShort = 0;
  let totalLossLong = 0;
  let totalLossShort = 0;
  let totalTaxLong = 0;
  let totalTaxShort = 0;

  let currentRow = 5;
  for (const securityId of securityIds) {
    const transactions = securitiesData[securityId];
    const securityName = securityMap[securityId] || 'Unknown';
    worksheet.getCell(`A${currentRow}`).value = securityName;
    let secBuyAmount = 0, secSellAmount = 0, secGainLong = 0, secGainShort = 0, secLossLong = 0, secLossShort = 0, secTaxLong = 0, secTaxShort = 0;

    for (const tx of transactions) {
      worksheet.getCell(`B${currentRow}`).value = tx.buyDate ? formatDate(tx.buyDate) : '';
      worksheet.getCell(`C${currentRow}`).value = tx.quantity || null;
      worksheet.getCell(`D${currentRow}`).value = tx.buyPrice || null;
      worksheet.getCell(`D${currentRow}`).numFmt = inrFormat;
      const buyAmount = (tx.quantity && tx.buyPrice) ? tx.quantity * tx.buyPrice : 0;
      worksheet.getCell(`E${currentRow}`).value = buyAmount || null;
      worksheet.getCell(`E${currentRow}`).numFmt = inrFormat;
      secBuyAmount += buyAmount;
      worksheet.getCell(`F${currentRow}`).value = tx.sellDate ? formatDate(tx.sellDate) : '';
      worksheet.getCell(`G${currentRow}`).value = tx.quantity || null;
      worksheet.getCell(`H${currentRow}`).value = tx.sellPrice || null;
      worksheet.getCell(`H${currentRow}`).numFmt = inrFormat;
      const sellAmount = (tx.quantity && tx.sellPrice) ? tx.quantity * tx.sellPrice : 0;
      worksheet.getCell(`I${currentRow}`).value = sellAmount || null;
      worksheet.getCell(`I${currentRow}`).numFmt = inrFormat;
      secSellAmount += sellAmount;
      if (tx.resultType === 'gain') {
        if (tx.gainType === 'LTCG') {
          worksheet.getCell(`J${currentRow}`).value = sellAmount - buyAmount;
          worksheet.getCell(`J${currentRow}`).numFmt = inrFormat;
          secGainLong += (sellAmount - buyAmount);
        } else {
          worksheet.getCell(`K${currentRow}`).value = sellAmount - buyAmount;
          worksheet.getCell(`K${currentRow}`).numFmt = inrFormat;
          secGainShort += (sellAmount - buyAmount);
        }
      } else if (tx.resultType === 'loss') {
        if (tx.gainType === 'LTCG') {
          worksheet.getCell(`L${currentRow}`).value = buyAmount - sellAmount;
          worksheet.getCell(`L${currentRow}`).numFmt = inrFormat;
          secLossLong += (buyAmount - sellAmount);
        } else {
          worksheet.getCell(`M${currentRow}`).value = buyAmount - sellAmount;
          worksheet.getCell(`M${currentRow}`).numFmt = inrFormat;
          secLossShort += (buyAmount - sellAmount);
        }
      }
      if (tx.gainType === 'LTCG') {
        worksheet.getCell(`N${currentRow}`).value = tx.calculatedTax || 0;
        worksheet.getCell(`N${currentRow}`).numFmt = inrFormat;
        secTaxLong += tx.calculatedTax || 0;
      } else {
        worksheet.getCell(`O${currentRow}`).value = tx.calculatedTax || 0;
        worksheet.getCell(`O${currentRow}`).numFmt = inrFormat;
        secTaxShort += tx.calculatedTax || 0;
      }
      currentRow++;
    }
    totalBuyAmount += secBuyAmount;
    totalSellAmount += secSellAmount;
    totalGainLong += secGainLong;
    totalGainShort += secGainShort;
    totalLossLong += secLossLong;
    totalLossShort += secLossShort;
    totalTaxLong += secTaxLong;
    totalTaxShort += secTaxShort;
    currentRow++;
  }
  worksheet.getCell(`D${currentRow}`).value = 'Total';
  worksheet.getCell(`E${currentRow}`).value = totalBuyAmount;
  worksheet.getCell(`E${currentRow}`).numFmt = inrFormat;
  worksheet.getCell(`I${currentRow}`).value = totalSellAmount;
  worksheet.getCell(`I${currentRow}`).numFmt = inrFormat;
  worksheet.getCell(`J${currentRow}`).value = totalGainLong;
  worksheet.getCell(`J${currentRow}`).numFmt = inrFormat;
  worksheet.getCell(`K${currentRow}`).value = totalGainShort;
  worksheet.getCell(`K${currentRow}`).numFmt = inrFormat;
  worksheet.getCell(`L${currentRow}`).value = totalLossLong;
  worksheet.getCell(`L${currentRow}`).numFmt = inrFormat;
  worksheet.getCell(`M${currentRow}`).value = totalLossShort;
  worksheet.getCell(`M${currentRow}`).numFmt = inrFormat;
  worksheet.getCell(`N${currentRow}`).value = totalTaxLong;
  worksheet.getCell(`N${currentRow}`).numFmt = inrFormat;
  worksheet.getCell(`O${currentRow}`).value = totalTaxShort;
  worksheet.getCell(`O${currentRow}`).numFmt = inrFormat;

  // Iterate over the entries security wise. Start from the last entry of every security and move upwards. If the buyDate and price is same as previous, add the quantity and amount and remove the row
  let trackingRow = 5;
  for (const securityId of securityIds) {
    const transactions = securitiesData[securityId];
    let startRow = trackingRow;
    let endRow = startRow + transactions.length - 1;
    for (let row = endRow; row > startRow; row--) {
      const currentBuyDate = worksheet.getCell(`B${row}`).value;
      const currentBuyPrice = worksheet.getCell(`D${row}`).value;
      const previousBuyDate = worksheet.getCell(`B${row - 1}`).value;
      const previousBuyPrice = worksheet.getCell(`D${row - 1}`).value;
      
      // Compare dates and prices - dates are already formatted strings at this point
      const datesMatch = currentBuyDate && previousBuyDate && currentBuyDate === previousBuyDate;
      const pricesMatch = currentBuyPrice && previousBuyPrice && currentBuyPrice === previousBuyPrice;
      
      if (datesMatch && pricesMatch) {
        // Same buy date and price, aggregate quantities and amounts
        const currentQuantity = worksheet.getCell(`C${row}`).value || 0;
        const previousQuantity = worksheet.getCell(`C${row - 1}`).value || 0;
        worksheet.getCell(`C${row - 1}`).value = currentQuantity + previousQuantity;

        const currentBuyAmount = worksheet.getCell(`E${row}`).value || 0;
        const previousBuyAmount = worksheet.getCell(`E${row - 1}`).value || 0;
        worksheet.getCell(`E${row - 1}`).value = currentBuyAmount + previousBuyAmount;
        worksheet.getCell(`E${row - 1}`).numFmt = inrFormat;

        worksheet.getCell(`B${row}`).value = null;
        worksheet.getCell(`C${row}`).value = null;
        worksheet.getCell(`D${row}`).value = null;
        worksheet.getCell(`E${row}`).value = null;
      }
    }
    trackingRow = endRow + 2; // Move to next security (skip blank row between securities)
  }

  // Apply currency format to all currency columns for the entire data range
  const lastRow = currentRow;
  for (let row = 5; row <= lastRow; row++) {
    worksheet.getCell(`D${row}`).numFmt = inrFormat; // Buy Price
    worksheet.getCell(`E${row}`).numFmt = inrFormat; // Buy Amount
    worksheet.getCell(`H${row}`).numFmt = inrFormat; // Sell Price
    worksheet.getCell(`I${row}`).numFmt = inrFormat; // Sell Amount
    worksheet.getCell(`J${row}`).numFmt = inrFormat; // Gain Long Term
    worksheet.getCell(`K${row}`).numFmt = inrFormat; // Gain Short Term
    worksheet.getCell(`L${row}`).numFmt = inrFormat; // Loss Long Term
    worksheet.getCell(`M${row}`).numFmt = inrFormat; // Loss Short Term
    worksheet.getCell(`N${row}`).numFmt = inrFormat; // Tax Long Term
    worksheet.getCell(`O${row}`).numFmt = inrFormat; // Tax Short Term
  }

  // Return buffer instead of saving to disk
  const buffer = await workbook.xlsx.writeBuffer();
  logger.info(`Excel buffer generated for download.`);
  return buffer;
};

const exportHoldingsToExcel = async (data, sheetName) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);

  // Helper to format date as dd/mm/yyyy
  const formatDate = (date) => {
    if (!date) return '';
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };

  // INR Currency format
  const inrFormat = '₹#,##0.00';

  // Build dynamic columns based on number of demat accounts
  const allDematAccounts = [];
  data.forEach(security => {
    security.dematAccounts.forEach(account => {
      const key = `${account.userAccountName}-${account.brokerName}`;
      if (!allDematAccounts.find(a => a.key === key)) {
        allDematAccounts.push({
          key,
          label: account.accountLabel,
          userAccountName: account.userAccountName,
          brokerName: account.brokerName
        });
      }
    });
  });

  // Sort accounts by userAccountName first, then by brokerName
  allDematAccounts.sort((a, b) => {
    const userCompare = a.userAccountName.localeCompare(b.userAccountName);
    if (userCompare !== 0) return userCompare;
    return a.brokerName.localeCompare(b.brokerName);
  });

  // Header row 1: Stock + Account labels (merged cells for each account)
  let currentCol = 2; // Start from column B (column A is for Stock)
  worksheet.getCell('A1').value = 'Stock';

  allDematAccounts.forEach(account => {
    const startCol = currentCol;
    const endCol = currentCol + 3; // Date, Quantity, Price, Amount = 4 columns
    worksheet.mergeCells(1, startCol, 1, endCol);
    worksheet.getCell(1, startCol).value = account.label;
    currentCol = endCol + 1;
  });

  // Header row 2: Column names for each account
  currentCol = 2;
  worksheet.getCell('A2').value = '';
  allDematAccounts.forEach(() => {
    worksheet.getCell(2, currentCol).value = 'Date';
    worksheet.getCell(2, currentCol + 1).value = 'Quantity';
    worksheet.getCell(2, currentCol + 2).value = 'Price';
    worksheet.getCell(2, currentCol + 3).value = 'Amount';
    currentCol += 4;
  });

  // Set column widths
  worksheet.getColumn(1).width = 20; // Stock column
  for (let col = 2; col <= 1 + (allDematAccounts.length * 4); col++) {
    const colIndex = (col - 2) % 4;
    if (colIndex === 0) worksheet.getColumn(col).width = 12; // Date
    else if (colIndex === 1) worksheet.getColumn(col).width = 10; // Quantity
    else if (colIndex === 2) worksheet.getColumn(col).width = 15; // Price
    else worksheet.getColumn(col).width = 15; // Amount
  }

  // Populate data rows
  let currentRow = 3;
  data.forEach(security => {
    // Create a map of holdings by demat account key
    const holdingsMap = new Map();
    security.dematAccounts.forEach(account => {
      const key = `${account.userAccountName}-${account.brokerName}`;
      holdingsMap.set(key, account);
    });

    // Find the maximum number of holdings (excluding Total) needed for this security
    let maxHoldingsCount = 0;
    security.dematAccounts.forEach(account => {
      if (account.holdings.length > maxHoldingsCount) {
        maxHoldingsCount = account.holdings.length;
      }
    });

    // Write security name (will be merged for all rows of this security)
    const securityStartRow = currentRow;
    worksheet.getCell(`A${securityStartRow}`).value = security.securityName;

    // Write holdings data for each account
    allDematAccounts.forEach(account => {
      const accountData = holdingsMap.get(account.key);
      let accountCol = 2 + (allDematAccounts.indexOf(account) * 4);
      let accountRow = currentRow;

      if (accountData) {
        // Write individual holdings
        accountData.holdings.forEach((holding, index) => {
          worksheet.getCell(accountRow + index, accountCol).value = formatDate(holding.buyDate);
          worksheet.getCell(accountRow + index, accountCol + 1).value = holding.quantity;
          worksheet.getCell(accountRow + index, accountCol + 2).value = holding.price;
          worksheet.getCell(accountRow + index, accountCol + 2).numFmt = inrFormat;
          worksheet.getCell(accountRow + index, accountCol + 3).value = holding.amount;
          worksheet.getCell(accountRow + index, accountCol + 3).numFmt = inrFormat;
        });

        // Write Total row at the same level for all accounts (after all holdings)
        const totalRow = currentRow + maxHoldingsCount;
        worksheet.getCell(totalRow, accountCol).value = 'Total';
        worksheet.getCell(totalRow, accountCol + 1).value = accountData.total.quantity;
        worksheet.getCell(totalRow, accountCol + 2).value = accountData.total.price;
        worksheet.getCell(totalRow, accountCol + 2).numFmt = inrFormat;
        worksheet.getCell(totalRow, accountCol + 3).value = accountData.total.amount;
        worksheet.getCell(totalRow, accountCol + 3).numFmt = inrFormat;
      }
    });

    // Merge stock name cells vertically for all rows of this security (excluding Total row)
    const securityEndRow = currentRow + maxHoldingsCount - 1;
    if (securityEndRow > securityStartRow) {
      worksheet.mergeCells(`A${securityStartRow}:A${securityEndRow}`);
      // Add bottom border to the merged stock cell
      worksheet.getCell(`A${securityEndRow}`).border = {
        bottom: { style: 'thin' }
      };
    } else {
      // Single row, add bottom border
      worksheet.getCell(`A${securityStartRow}`).border = {
        bottom: { style: 'thin' }
      };
    }

    // Add top border to Total row (at the same level for all accounts)
    const totalRow = currentRow + maxHoldingsCount;
    allDematAccounts.forEach((account, index) => {
      const accountCol = 2 + (index * 4);
      
      // Add top border to all 4 columns of the Total row
      for (let col = accountCol; col < accountCol + 4; col++) {
        worksheet.getCell(totalRow, col).border = {
          top: { style: 'thin' }
        };
      }
    });

    const totalRowsForSecurity = maxHoldingsCount + 1; // +1 for Total row
    currentRow += totalRowsForSecurity; // Move to next security
    currentRow++; // Add blank row after each security
  });

  // Apply styling to header rows
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(2).font = { bold: true };
  worksheet.getRow(1).alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.getRow(2).alignment = { horizontal: 'center', vertical: 'middle' };

  // Apply alignment to stock column
  for (let row = 3; row <= currentRow; row++) {
    worksheet.getCell(`A${row}`).alignment = { vertical: 'middle' };
  }

  // Return buffer for download
  const buffer = await workbook.xlsx.writeBuffer();
  logger.info(`Holdings Excel buffer generated for download.`);
  return buffer;
}

const exportLedgerToExcel = async (data, sheetName) => {
  const { startDate, endDate, ledgerEntries } = data;
  
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);

  // Helper to format date as dd/mm/yyyy
  const formatDate = (date) => {
    if (!date) return '';
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };

  // INR Currency format
  const inrFormat = '₹#,##0.00';

  // Row 1: Period information
  worksheet.mergeCells('A1:E1');
  worksheet.getCell('A1').value = `Period from: ${formatDate(startDate)} to ${formatDate(endDate)}`;
  worksheet.getCell('A1').font = { bold: true };
  worksheet.getCell('A1').alignment = { horizontal: 'left', vertical: 'middle' };

  // Row 2: Empty row for spacing
  
  // Row 3: Header row
  worksheet.getCell('A3').value = 'Date';
  worksheet.getCell('B3').value = 'Type';
  worksheet.getCell('C3').value = 'Credit';
  worksheet.getCell('D3').value = 'Debit';
  worksheet.getCell('E3').value = 'Remarks';
  
  worksheet.getRow(3).font = { bold: true };
  worksheet.getRow(3).alignment = { horizontal: 'center', vertical: 'middle' };

  // Set column widths
  worksheet.columns = [
    { key: 'A', width: 15 }, // Date
    { key: 'B', width: 12 }, // Type
    { key: 'C', width: 20 }, // Credit
    { key: 'D', width: 20 }, // Debit
    { key: 'E', width: 40 }, // Remarks
  ];

  // Sort ledger entries by date
  const sortedEntries = [...ledgerEntries].sort((a, b) => new Date(a.date) - new Date(b.date));

  // Populate data rows
  let currentRow = 4;
  let totalCredit = 0;
  let totalDebit = 0;

  sortedEntries.forEach(entry => {
    worksheet.getCell(`A${currentRow}`).value = formatDate(entry.date);
    worksheet.getCell(`B${currentRow}`).value = entry.type || '';
    
    // Split amount into Credit and Debit columns
    if (entry.transactionAmount > 0) {
      worksheet.getCell(`C${currentRow}`).value = entry.transactionAmount;
      worksheet.getCell(`C${currentRow}`).numFmt = inrFormat;
      worksheet.getCell(`C${currentRow}`).font = { color: { argb: 'FF008000' } };
      totalCredit += entry.transactionAmount;
    } else if (entry.transactionAmount < 0) {
      worksheet.getCell(`D${currentRow}`).value = Math.abs(entry.transactionAmount);
      worksheet.getCell(`D${currentRow}`).numFmt = inrFormat;
      worksheet.getCell(`D${currentRow}`).font = { color: { argb: 'FFFF0000' } };
      totalDebit += Math.abs(entry.transactionAmount);
    }
    
    worksheet.getCell(`E${currentRow}`).value = entry.remarks || '';
    
    currentRow++;
  });

  // Add total row with merged cells for "Total"
  worksheet.mergeCells(`A${currentRow}:B${currentRow}`);
  worksheet.getCell(`A${currentRow}`).value = 'Total';
  worksheet.getCell(`A${currentRow}`).font = { bold: true };
  worksheet.getCell(`A${currentRow}`).alignment = { horizontal: 'center', vertical: 'middle' };
  
  worksheet.getCell(`C${currentRow}`).value = totalCredit;
  worksheet.getCell(`C${currentRow}`).numFmt = inrFormat;
  worksheet.getCell(`C${currentRow}`).font = { bold: true };
  
  worksheet.getCell(`D${currentRow}`).value = totalDebit;
  worksheet.getCell(`D${currentRow}`).numFmt = inrFormat;
  worksheet.getCell(`D${currentRow}`).font = { bold: true };
  
  // Add border to total row
  worksheet.getCell(`A${currentRow}`).border = { top: { style: 'thin' } };
  worksheet.getCell(`B${currentRow}`).border = { top: { style: 'thin' } };
  worksheet.getCell(`C${currentRow}`).border = { top: { style: 'thin' } };
  worksheet.getCell(`D${currentRow}`).border = { top: { style: 'thin' } };
  worksheet.getCell(`E${currentRow}`).border = { top: { style: 'thin' } };

  // Return buffer for download
  const buffer = await workbook.xlsx.writeBuffer();
  logger.info(`Ledger Excel buffer generated for download.`);
  return buffer;
}

module.exports = {
  exportPnlToExcel,
  exportHoldingsToExcel,
  exportLedgerToExcel
};