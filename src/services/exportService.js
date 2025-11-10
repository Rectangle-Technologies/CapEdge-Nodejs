const { Parser } = require('json2csv');
const ExcelJS = require('exceljs');
const logger = require('../utils/logger');
const Security = require('../models/Security');

const exportToExcel = async (data, filename, sheetName) => {
  const { startDate, endDate, ...securitiesData } = data;
  const securityIds = Object.keys(securitiesData);
  const securities = await Security.find({ _id: { $in: securityIds } }).select('name');
  const securityMap = {};
  securities.forEach(sec => {
    securityMap[sec._id.toString()] = sec.name;
  });

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);

  // Helper to format date as dd/mm/yy using locale
  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-GB');
  };
  worksheet.mergeCells('A1:P1');
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

  let totalBuyAmount = 0;
  let totalSellAmount = 0;
  let totalGainLong = 0;
  let totalGainShort = 0;
  let totalLossLong = 0;
  let totalLossShort = 0;
  let totalTaxLong = 0;
  let totalTaxShort = 0;

  let currentRow = 5, prevRow = 4;
  for (const securityId of securityIds) {
    const transactions = securitiesData[securityId];
    const securityName = securityMap[securityId] || 'Unknown';
    worksheet.getCell(`A${currentRow}`).value = securityName;
    let secBuyAmount = 0, secSellAmount = 0, secGainLong = 0, secGainShort = 0, secLossLong = 0, secLossShort = 0, secTaxLong = 0, secTaxShort = 0;

    for (const tx of transactions) {
      worksheet.getCell(`B${currentRow}`).value = tx.buyDate ? formatDate(tx.buyDate) : '';
      worksheet.getCell(`C${currentRow}`).value = tx.quantity || '';
      worksheet.getCell(`D${currentRow}`).value = tx.buyPrice || '';
      const buyAmount = (tx.quantity && tx.buyPrice) ? tx.quantity * tx.buyPrice : 0;
      worksheet.getCell(`E${currentRow}`).value = buyAmount || '';
      secBuyAmount += buyAmount;
      worksheet.getCell(`F${currentRow}`).value = tx.sellDate ? formatDate(tx.sellDate) : '';
      worksheet.getCell(`G${currentRow}`).value = tx.quantity || '';
      worksheet.getCell(`H${currentRow}`).value = tx.sellPrice || '';
      const sellAmount = (tx.quantity && tx.sellPrice) ? tx.quantity * tx.sellPrice : 0;
      worksheet.getCell(`I${currentRow}`).value = sellAmount || '';
      secSellAmount += sellAmount;
      if (tx.resultType === 'gain') {
        if (tx.gainType === 'LTCG') {
          worksheet.getCell(`J${currentRow}`).value = sellAmount - buyAmount;
          secGainLong += (sellAmount - buyAmount);
        } else {
          worksheet.getCell(`K${currentRow}`).value = sellAmount - buyAmount;
          secGainShort += (sellAmount - buyAmount);
        }
      } else if (tx.resultType === 'loss') {
        if (tx.gainType === 'LTCG') {
          worksheet.getCell(`L${currentRow}`).value = buyAmount - sellAmount;
          secLossLong += (buyAmount - sellAmount);
        } else {
          worksheet.getCell(`M${currentRow}`).value = buyAmount - sellAmount;
          secLossShort += (buyAmount - sellAmount);
        }
      }
      if (tx.gainType === 'LTCG') {
        worksheet.getCell(`N${currentRow}`).value = tx.calculatedTax || 0;
        secTaxLong += tx.calculatedTax || 0;
      } else {
        worksheet.getCell(`O${currentRow}`).value = tx.calculatedTax || 0;
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
  worksheet.getCell(`I${currentRow}`).value = totalSellAmount;
  worksheet.getCell(`J${currentRow}`).value = totalGainLong;
  worksheet.getCell(`K${currentRow}`).value = totalGainShort;
  worksheet.getCell(`L${currentRow}`).value = totalLossLong;
  worksheet.getCell(`M${currentRow}`).value = totalLossShort;
  worksheet.getCell(`N${currentRow}`).value = totalTaxLong;
  worksheet.getCell(`O${currentRow}`).value = totalTaxShort;

  // Iterate over the entries security wise. Start from the last entry of every security and move upwards. If the buyDate and price is same as previous, add the quantity and amount and remove the row
  for (const securityId of securityIds) {
    const transactions = securitiesData[securityId];
    let startRow = 5;
    let endRow = startRow + transactions.length - 1;
    for (let row = endRow; row > startRow; row--) {
      const currentBuyDate = worksheet.getCell(`B${row}`).value;
      const currentBuyPrice = worksheet.getCell(`D${row}`).value;
      const previousBuyDate = worksheet.getCell(`B${row - 1}`).value;
      const previousBuyPrice = worksheet.getCell(`D${row - 1}`).value;
      if (currentBuyDate === previousBuyDate && currentBuyPrice === previousBuyPrice) {
        // Same buy date and price, aggregate quantities and amounts
        const currentQuantity = worksheet.getCell(`C${row}`).value || 0;
        const previousQuantity = worksheet.getCell(`C${row - 1}`).value || 0;
        worksheet.getCell(`C${row - 1}`).value = currentQuantity + previousQuantity;

        const currentBuyAmount = worksheet.getCell(`E${row}`).value || 0;
        const previousBuyAmount = worksheet.getCell(`E${row - 1}`).value || 0;
        worksheet.getCell(`E${row - 1}`).value = currentBuyAmount + previousBuyAmount;

        worksheet.getCell(`B${row}`).value = null;
        worksheet.getCell(`C${row}`).value = null;
        worksheet.getCell(`D${row}`).value = null;
        worksheet.getCell(`E${row}`).value = null;
      }
    }
  }

  // Return buffer instead of saving to disk
  const buffer = await workbook.xlsx.writeBuffer();
  logger.info(`Excel buffer generated for download.`);
  return buffer;
};

module.exports = {
  exportToExcel
};
