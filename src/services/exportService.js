const ExcelJS = require('exceljs');
const logger = require('../utils/logger');
const Security = require('../models/Security');

const exportToExcel = async (data, sheetName) => {
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

module.exports = {
  exportToExcel
};
