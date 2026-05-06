/**
 * Parser for R. Wadiwala Securities Pvt. Ltd. contract notes.
 *
 * Output shape (per-contract): see parsers/index.js for the canonical structure.
 * Wadiwala PDFs are single-client; this parser always returns an array of length 1.
 */

const ISIN_RE = /^IN[EF][A-Z0-9]{9}$/;

const parseWadiwala = ({ pages }) => {
  const allItems = [];
  for (const page of pages) {
    for (const item of page.items) allItems.push(item);
  }

  const allText = pages.flatMap((p) => p.rows.map((r) => r.items.map((i) => i.str).join('|'))).join('\n');

  const meta = extractMeta(allText);
  const summary = extractSummaryLines(pages);
  const charges = extractCharges(allText);

  return [
    {
      brokerName: 'R. Wadiwala Securities Pvt. Ltd.',
      brokerCode: 'WADIWALA',
      contractNoteNo: meta.contractNoteNo,
      tradeDate: meta.tradeDate,
      client: meta.client,
      summary,
      charges
    }
  ];
};

const extractMeta = (text) => {
  const get = (re) => {
    const m = text.match(re);
    return m ? m[1].trim() : null;
  };
  return {
    contractNoteNo: get(/Contract Note No\.?\s*:?\|?\s*([^|\s]+)/i),
    tradeDate: parseDDMMYYYY(get(/Trade Date\s*:?\|?\s*(\d{2}\/\d{2}\/\d{4})/i)),
    client: {
      name: get(/Name of the Client\s*:?\|?\s*([^|\n]+?)(?:\||\n|$)/i),
      pan: get(/PAN of Client\s*:?\|?\s*([A-Z0-9*]+)/i),
      ucc: get(/UCC of Client\s*:?\|?\s*([^|\s]+)/i)
    }
  };
};

const parseDDMMYYYY = (s) => {
  if (!s) return null;
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
};

/**
 * Walks every PDF row, finds rows beginning with an ISIN token,
 * and parses the trailing numeric tokens into the summary shape.
 *
 * Wadiwala's summary row layout (single row per ISIN):
 *   ISIN | Symbol/Name | (BUY 5 cols or empty) | (SELL 5 cols or empty) | netQty | netObligation
 *
 * Number of trailing numeric tokens distinguishes single-side (7) from both-side (12).
 */
const extractSummaryLines = (pages) => {
  const lines = [];
  for (const page of pages) {
    for (const row of page.rows) {
      const items = row.items;
      if (items.length === 0) continue;
      const first = items[0].str.trim();
      if (!ISIN_RE.test(first)) continue;

      const tokens = items.map((i) => i.str.trim()).filter(Boolean);
      const isin = tokens[0];

      // Symbol/name = consecutive non-numeric tokens after ISIN
      let i = 1;
      const nameTokens = [];
      while (i < tokens.length && !isNumericToken(tokens[i])) {
        nameTokens.push(tokens[i]);
        i++;
      }
      const symbol = nameTokens.join(' ').trim();
      const numbers = tokens.slice(i).map(Number).filter((n) => !Number.isNaN(n));

      const parsed = parseSummaryNumbers(numbers);
      if (!parsed) continue;

      lines.push({
        isin,
        symbol,
        ...parsed
      });
    }
  }
  return lines;
};

const isNumericToken = (s) => /^-?\d+(\.\d+)?$/.test(s.replace(/[,\s]/g, ''));

const parseSummaryNumbers = (nums) => {
  // Single-side row: 7 numbers (qty, WAP, brok, WAP_after, total, netQty, netObl)
  // Both-side row: 12 numbers (BUY 5 + SELL 5 + netQty + netObl)
  if (nums.length === 7) {
    const [qty, wap, brok, wapAfter, total, netQty, netObl] = nums;
    if (netQty >= 0) {
      return {
        buyQty: qty, buyWAP: wap, buyBrokerage: brok, buyWAPAfter: wapAfter, buyTotal: total,
        sellQty: 0, sellWAP: 0, sellBrokerage: 0, sellWAPAfter: 0, sellTotal: 0,
        netQty, netObligation: netObl
      };
    }
    return {
      buyQty: 0, buyWAP: 0, buyBrokerage: 0, buyWAPAfter: 0, buyTotal: 0,
      sellQty: qty, sellWAP: wap, sellBrokerage: brok, sellWAPAfter: wapAfter, sellTotal: total,
      netQty, netObligation: netObl
    };
  }
  if (nums.length === 12) {
    const [bq, bw, bb, bwa, bt, sq, sw, sb, swa, st, netQty, netObl] = nums;
    return {
      buyQty: bq, buyWAP: bw, buyBrokerage: bb, buyWAPAfter: bwa, buyTotal: bt,
      sellQty: sq, sellWAP: sw, sellBrokerage: sb, sellWAPAfter: swa, sellTotal: st,
      netQty, netObligation: netObl
    };
  }
  return null;
};

/**
 * Wadiwala "Obligation Details" block has a TOTAL (Net) column.
 * totalCost = |PayIn/Payout - NetReceivablePayable|, since the difference equals
 * brokerage + STT + GST + stamp + SEBI etc.
 */
const extractCharges = (text) => {
  const findTotal = (label) => {
    const re = new RegExp(`${label}[^\\n]*?([-\\d.]+)\\s*$`, 'mi');
    const m = text.match(re);
    if (m) return parseFloat(m[1]);
    return null;
  };

  const payInOut = findTotal('PayIn\\/Payout Obligation');
  const netReceivable = findTotal('Net amount Receivable.*?Client');

  let totalCost = 0;
  if (payInOut != null && netReceivable != null) {
    totalCost = Math.abs(Math.abs(payInOut) - Math.abs(netReceivable));
  }

  return {
    payInOutObligation: payInOut,
    netReceivablePayable: netReceivable,
    totalCost
  };
};

module.exports = { parseWadiwala };
