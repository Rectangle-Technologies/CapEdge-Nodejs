/**
 * Parser for South Gujarat Shares & Sharebrokers Limited (SGSSL) contract notes.
 *
 * SGSSL PDFs can hold multiple clients (one ContractNoteNo per client). This
 * parser groups pages by UCC/contract-no, then for each group extracts the
 * summary rows (positionally) and the obligation/charges block.
 *
 * Returns an array of `rawContract` objects — one per (client, contract).
 */

const ISIN_RE = /^IN[EF][A-Z0-9]{9}$/;

// X-position buckets for SGSSL summary rows (observed across the sample).
// Tolerance is generous because slight inter-page drift exists.
const COL_BUY_QTY = [120, 165];
const COL_BUY_WAP = [170, 200];
const COL_BUY_BROK = [205, 225];
const COL_BUY_WAP_AFTER = [230, 260];
const COL_BUY_TOTAL = [265, 315];
const COL_SELL_QTY = [316, 355];
const COL_SELL_WAP = [360, 400];
const COL_SELL_BROK = [405, 425];
const COL_SELL_WAP_AFTER = [430, 470];
const COL_SELL_TOTAL = [475, 525];
const COL_NET_QTY = [530, 565];
const COL_NET_OBL = [566, 620];

const inRange = (x, [lo, hi]) => x >= lo && x <= hi;

const parseSGSSL = ({ pages }) => {
  // Step 1: per-page metadata
  const pageMetas = pages.map((p, idx) => ({
    pageIndex: idx,
    ...extractPageMeta(p)
  }));

  // Step 2: group consecutive pages by UCC (or fallback by contract note no)
  const groups = groupPagesByContract(pageMetas);

  // The settlement number is shared across all contracts in the PDF.
  // It is the value under the "Equity NCL" column in the settlement grid,
  // and also appears in the Obligation Details as "Settlement Number".
  // We use it as the reference number (contractNoteNo) instead of the
  // per-client CONTRACT NOTE NO, because the client records transactions
  // by settlement number for SGSSL.
  const settlementNo = pageMetas.find((m) => m.settlementNo)?.settlementNo || null;

  // Step 3: per group, parse summary rows and charges
  return groups.map((group) => {
    const groupPages = group.pageIndexes.map((i) => pages[i]);
    const summary = extractSummaryRows(groupPages);
    const charges = extractCharges(groupPages);

    return {
      brokerName: 'South Gujarat Shares and Sharebrokers Limited',
      brokerCode: 'SGSSL',
      contractNoteNo: settlementNo || group.contractNoteNo,
      tradeDate: group.tradeDate,
      client: group.client,
      summary,
      charges
    };
  });
};

const extractPageMeta = (page) => {
  // Build label-to-value map by looking at items and finding values that follow known labels.
  // Approach: find specific pattern matches on the items array.
  const items = page.items;
  const text = page.rows.map((r) => r.items.map((i) => i.str).join('|')).join('\n');

  const meta = {
    ucc: null,
    contractNoteNo: null,
    settlementNo: null,
    tradeDate: null,
    client: { name: null, pan: null, ucc: null }
  };

  // UCC: 6-digit number near "UCC & Client Code"
  const uccItem = findValueAfterLabel(items, /UCC\s*&?\s*Client/i, /^\d{5,7}$/);
  if (uccItem) {
    meta.ucc = uccItem.str;
    meta.client.ucc = uccItem.str;
  }

  // Contract Note No: number near "CONTRACT NOTE NO"
  const cnItem = findValueAfterLabel(items, /CONTRACT NOTE NO/i, /^\d{3,7}$/);
  if (cnItem) meta.contractNoteNo = cnItem.str;

  // Trade Date: dd/mm/yyyy near "Trade Date"
  const tdItem = findValueAfterLabel(items, /Trade Date/i, /^\d{2}\/\d{2}\/\d{4}$/);
  if (tdItem) meta.tradeDate = parseDDMMYYYY(tdItem.str);

  // PAN
  const panItem = findValueAfterLabel(items, /PAN of Client/i, /^[A-Z0-9*]{8,12}$/);
  if (panItem) meta.client.pan = panItem.str;

  // Settlement Number from Obligation Details block (e.g. "Settlement Number | 2026078")
  // This is shared across all contracts in the PDF and is used as the reference number.
  const settlementNoMatch = text.match(/Settlement Number[^|\n]*[|\s]+(\d+)/i);
  if (settlementNoMatch) meta.settlementNo = settlementNoMatch[1];

  // Client name: uppercase 3+ word string between client-related labels
  const nameMatch = text.match(/Name of the Client\s*:?\s*\|?\s*\n?([A-Z][A-Z\s.&]+?)(?:\n|\|)/);
  if (nameMatch) meta.client.name = nameMatch[1].trim();

  return meta;
};

/**
 * Find the item closest (by Euclidean distance) to a label-matching item that
 * also matches the given value pattern.
 */
const findValueAfterLabel = (items, labelRe, valueRe) => {
  const labelItems = items.filter((i) => labelRe.test(i.str));
  if (labelItems.length === 0) return null;
  const candidates = items.filter((i) => valueRe.test(i.str.trim()));
  if (candidates.length === 0) return null;

  let best = null;
  let bestDist = Infinity;
  for (const label of labelItems) {
    for (const cand of candidates) {
      const d = Math.hypot(label.x - cand.x, label.y - cand.y);
      if (d < bestDist) {
        best = cand;
        bestDist = d;
      }
    }
  }
  return best;
};

const parseDDMMYYYY = (s) => {
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
};

/**
 * Group consecutive pages that share the same UCC into one logical contract.
 * Falls back to grouping by contractNoteNo if UCC is missing.
 */
const groupPagesByContract = (metas) => {
  const groups = [];
  let current = null;
  for (const m of metas) {
    const key = m.ucc || m.contractNoteNo;
    if (!key) {
      // Page belongs to whatever contract was in progress
      if (current) current.pageIndexes.push(m.pageIndex);
      continue;
    }
    if (!current || current.key !== key) {
      current = {
        key,
        contractNoteNo: m.contractNoteNo,
        tradeDate: m.tradeDate,
        client: m.client,
        pageIndexes: [m.pageIndex]
      };
      groups.push(current);
    } else {
      current.pageIndexes.push(m.pageIndex);
      // Fill in missing meta if a later page has it
      if (!current.contractNoteNo && m.contractNoteNo) current.contractNoteNo = m.contractNoteNo;
      if (!current.tradeDate && m.tradeDate) current.tradeDate = m.tradeDate;
      if (!current.client?.name && m.client?.name) current.client = m.client;
    }
  }
  return groups;
};

const extractSummaryRows = (groupPages) => {
  const lines = [];
  for (const page of groupPages) {
    for (const row of page.rows) {
      const items = row.items;
      if (items.length < 3) continue;
      const first = items[0].str.trim();
      if (!ISIN_RE.test(first)) continue;

      // Group items into column buckets by X-position
      const cols = {
        buyQty: 0, buyWAP: 0, buyBrokerage: 0, buyWAPAfter: 0, buyTotal: 0,
        sellQty: 0, sellWAP: 0, sellBrokerage: 0, sellWAPAfter: 0, sellTotal: 0,
        netQty: 0, netObligation: 0
      };
      let symbolToken = '';

      for (let i = 1; i < items.length; i++) {
        const it = items[i];
        const trimmed = it.str.trim();
        // Only treat as numeric if the entire token parses as a number
        const isNumeric = /^-?\d+(\.\d+)?$/.test(trimmed.replace(/,/g, ''));
        if (!isNumeric) {
          // Treat as part of symbol/name (only if to the left of the data columns)
          if (it.x < COL_BUY_QTY[0]) symbolToken += (symbolToken ? ' ' : '') + trimmed;
          continue;
        }
        const num = parseFloat(trimmed.replace(/,/g, ''));

        const x = it.x;
        if (inRange(x, COL_BUY_QTY)) cols.buyQty = num;
        else if (inRange(x, COL_BUY_WAP)) cols.buyWAP = num;
        else if (inRange(x, COL_BUY_BROK)) cols.buyBrokerage = num;
        else if (inRange(x, COL_BUY_WAP_AFTER)) cols.buyWAPAfter = num;
        else if (inRange(x, COL_BUY_TOTAL)) cols.buyTotal = num;
        else if (inRange(x, COL_SELL_QTY)) cols.sellQty = num;
        else if (inRange(x, COL_SELL_WAP)) cols.sellWAP = num;
        else if (inRange(x, COL_SELL_BROK)) cols.sellBrokerage = num;
        else if (inRange(x, COL_SELL_WAP_AFTER)) cols.sellWAPAfter = num;
        else if (inRange(x, COL_SELL_TOTAL)) cols.sellTotal = num;
        else if (inRange(x, COL_NET_QTY)) cols.netQty = num;
        else if (inRange(x, COL_NET_OBL)) cols.netObligation = num;
      }

      lines.push({
        isin: first,
        symbol: symbolToken || first,
        ...cols
      });
    }
  }
  return lines;
};

/**
 * Charges block: total cost = Pay In/Out Obligation - Net Amount Receivable/Payable.
 * Both numbers can carry CR/DR suffix; we use absolute values.
 */
const extractCharges = (groupPages) => {
  const text = groupPages
    .flatMap((p) => p.rows.map((r) => r.items.map((i) => i.str).join('|')))
    .join('\n');

  const findAmount = (label) => {
    const re = new RegExp(`${label}[^\\n]*?([\\d,]+\\.\\d{2})\\s*(CR|DR)?`, 'i');
    const m = text.match(re);
    if (!m) return null;
    const value = parseFloat(m[1].replace(/,/g, ''));
    const sign = (m[2] || '').toUpperCase() === 'DR' ? -1 : 1;
    return value * sign;
  };

  const payInOut = findAmount('Pay\\s*In\\/?Pay\\s*Out Obligation');
  const netReceivable = findAmount('Net Amount Receivable\\/Payable By Client');

  let totalCost = 0;
  if (payInOut != null && netReceivable != null) {
    totalCost = Math.abs(Math.abs(payInOut) - Math.abs(netReceivable));
  }

  return { payInOutObligation: payInOut, netReceivablePayable: netReceivable, totalCost };
};

module.exports = { parseSGSSL };
