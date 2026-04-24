// One-shot data fix for BUG-004: normalize Zerodha Opening balance entry's
// date from full-timestamp to midnight UTC so it sorts correctly against
// user-entered (date-only) ledger entries on the same day.
// Safe to delete after running.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const LedgerEntry = require('../src/models/LedgerEntry');

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected.');

  const dematAccountId = '69eb34b23ec58ff6dc9f1df6'; // Zerodha
  const opening = await LedgerEntry.findOne({
    dematAccountId,
    remarks: 'Opening balance'
  });

  if (!opening) {
    console.log('No Opening balance entry found.');
    process.exit(0);
  }

  const d = new Date(opening.date);
  const midnight = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  console.log(`Opening date: ${opening.date.toISOString()} -> ${midnight.toISOString()}`);

  opening.date = midnight;
  await opening.save();
  console.log('Updated.');

  await mongoose.disconnect();
})();
