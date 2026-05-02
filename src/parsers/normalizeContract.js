/**
 * Normalize a raw parsed contract into a "preview contract" — the shape
 * the frontend renders for user review and the confirm endpoint accepts back.
 *
 * Steps applied here:
 * 1. Per-summary-line, derive lines[] grouped by (security, deliveryType).
 *    Same-ISIN BUY+SELL on one contract → matched portion becomes Intraday,
 *    leftover becomes Delivery.
 * 2. Pro-rate `charges.totalCost` across lines weighted by trade value.
 * 3. Fuzzy-match each line's symbol/name against Security collection.
 * 4. Fuzzy-match client name against UserAccount; resolve DematAccount via
 *    (userAccount, broker).
 *
 * This module performs DB lookups; pass a `lookups` adapter so it can be
 * unit-tested without a live MongoDB.
 */

const buildPreviewContract = async (rawContract, lookups) => {
  const { lines } = expandLines(rawContract.summary);
  // Per product decision: charges (transactionCost) default to 0 — no proration
  // from the contract-level totals. User can edit per-row in the form.

  // Resolve security candidates per line
  for (const line of lines) {
    const matches = await lookups.fuzzyMatchSecurities(line.rawSymbol);
    line.securityCandidates = matches;
    line.matchedSecurityId = matches.length === 1 ? matches[0]._id : null;
    if (line.matchedSecurityId) {
      line.matchedSecurityName = matches[0].name;
    }
  }

  // Resolve user account + demat
  const userAccount = await lookups.fuzzyMatchUserAccount(rawContract.client?.name);
  let dematAccount = null;
  if (userAccount) {
    dematAccount = await lookups.findDematByUserAndBroker(userAccount._id, rawContract.brokerCode);
  }

  const warnings = [];
  if (!userAccount) warnings.push(`Could not match client "${rawContract.client?.name}" to a user account`);
  if (userAccount && !dematAccount) warnings.push(`No demat account found for ${userAccount.name} with broker ${rawContract.brokerName}`);
  for (const line of lines) {
    if (!line.matchedSecurityId) {
      warnings.push(`Could not auto-match security "${line.rawSymbol}" (ISIN ${line.rawIsin})`);
    }
  }

  return {
    brokerName: rawContract.brokerName,
    brokerCode: rawContract.brokerCode,
    contractNoteNo: rawContract.contractNoteNo,
    tradeDate: rawContract.tradeDate,
    detectedClient: rawContract.client,
    matchedUserAccount: userAccount,
    matchedDematAccount: dematAccount,
    charges: rawContract.charges,
    lines,
    warnings
  };
};

/**
 * Expand each summary line into 1 or 2 transaction lines based on the
 * intraday rule: matched(BUY,SELL) qty → Intraday, leftover → Delivery.
 *
 * Returns { lines, totalTradeValue } where totalTradeValue is the basis for
 * charge proration (sum of |qty * price| across all lines).
 */
const expandLines = (summary) => {
  const lines = [];
  let totalTradeValue = 0;

  for (const s of summary) {
    const matched = Math.min(s.buyQty, s.sellQty);

    if (matched > 0) {
      const buyPrice = s.buyWAP || 0;
      const sellPrice = s.sellWAP || 0;
      const tradeValue = matched * (buyPrice + sellPrice);
      totalTradeValue += tradeValue;
      lines.push({
        rawIsin: s.isin,
        rawSymbol: s.symbol,
        deliveryType: 'Intraday',
        type: 'BUY',
        quantity: matched,
        buyPrice,
        sellPrice,
        price: null,
        tradeValueBasis: tradeValue,
        transactionCost: 0,
        matchedSecurityId: null,
        matchedSecurityName: null,
        securityCandidates: []
      });
    }

    const leftoverBuy = s.buyQty - matched;
    if (leftoverBuy > 0) {
      const price = s.buyWAP || 0;
      const value = leftoverBuy * price;
      totalTradeValue += value;
      lines.push({
        rawIsin: s.isin,
        rawSymbol: s.symbol,
        deliveryType: 'Delivery',
        type: 'BUY',
        quantity: leftoverBuy,
        price,
        buyPrice: null,
        sellPrice: null,
        tradeValueBasis: value,
        transactionCost: 0,
        matchedSecurityId: null,
        matchedSecurityName: null,
        securityCandidates: []
      });
    }

    const leftoverSell = s.sellQty - matched;
    if (leftoverSell > 0) {
      const price = s.sellWAP || 0;
      const value = leftoverSell * price;
      totalTradeValue += value;
      lines.push({
        rawIsin: s.isin,
        rawSymbol: s.symbol,
        deliveryType: 'Delivery',
        type: 'SELL',
        quantity: leftoverSell,
        price,
        buyPrice: null,
        sellPrice: null,
        tradeValueBasis: value,
        transactionCost: 0,
        matchedSecurityId: null,
        matchedSecurityName: null,
        securityCandidates: []
      });
    }
  }

  return { lines, totalTradeValue };
};

const prorateCost = (lines, totalTradeValue, totalCost) => {
  if (totalCost <= 0 || totalTradeValue <= 0) return;
  let assigned = 0;
  for (let i = 0; i < lines.length - 1; i++) {
    const portion = (lines[i].tradeValueBasis / totalTradeValue) * totalCost;
    lines[i].transactionCost = round2(portion);
    assigned += lines[i].transactionCost;
  }
  // Remainder goes to last line so the sum exactly equals totalCost
  if (lines.length > 0) {
    lines[lines.length - 1].transactionCost = round2(totalCost - assigned);
  }
};

const round2 = (n) => Math.round(n * 100) / 100;

module.exports = { buildPreviewContract, expandLines, prorateCost };
