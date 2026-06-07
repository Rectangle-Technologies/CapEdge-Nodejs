/**
 * Date-only helpers — enforce the app-wide convention that all *calendar-date*
 * fields are stored as UTC midnight and read via UTC, so timezone is never a factor.
 *
 * A calendar date (trade date, split date, FY boundary, buy date) is a date, not a
 * moment. We encode it as the canonical instant `YYYY-MM-DDT00:00:00.000Z`. The only
 * place a timezone is consulted is `todayIST()` — turning "now" into "today in India".
 */

const APP_TIMEZONE = 'Asia/Kolkata';

/**
 * Normalize any date-ish input to UTC midnight of its UTC calendar day.
 * Pass-through for null/undefined/'' (lets `required` validators do their job) and
 * for unparseable input (lets Mongoose's own cast raise the error).
 * @param {Date|string|number} input
 * @returns {Date|*}
 */
const toUTCDateOnly = (input) => {
  if (input === null || input === undefined || input === '') return input;
  const d = new Date(input);
  if (isNaN(d.getTime())) return input;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};

/**
 * Last representable instant of a calendar day (UTC). Used for inclusive range
 * upper bounds such as FinancialYear.endDate.
 * @param {Date|string|number} input
 * @returns {Date|*}
 */
const endOfUTCDay = (input) => {
  if (input === null || input === undefined || input === '') return input;
  const d = new Date(input);
  if (isNaN(d.getTime())) return input;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
};

/**
 * The current calendar date in India, anchored at UTC midnight.
 * This is the one boundary where a timezone legitimately matters.
 * @returns {Date}
 */
const todayIST = () => {
  const ymd = new Date().toLocaleDateString('en-CA', { timeZone: APP_TIMEZONE }); // 'YYYY-MM-DD'
  return new Date(ymd); // ISO date-only string -> parsed as UTC midnight
};

/**
 * 'YYYY-MM-DD' key from the UTC calendar day (safe once data is UTC-midnight).
 * @param {Date|string|number} input
 * @returns {string|null}
 */
const utcDayKey = (input) => {
  if (input === null || input === undefined || input === '') return null;
  const d = new Date(input);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
};

/**
 * Format a calendar date as 'DD/MM/YYYY' using UTC parts (for exports / messages).
 * @param {Date|string|number} input
 * @returns {string}
 */
const formatDMY = (input) => {
  if (input === null || input === undefined || input === '') return '';
  const d = new Date(input);
  if (isNaN(d.getTime())) return '';
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

module.exports = { APP_TIMEZONE, toUTCDateOnly, endOfUTCDay, todayIST, utcDayKey, formatDMY };
