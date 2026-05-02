const Security = require('../models/Security');
const UserAccount = require('../models/UserAccount');
const Broker = require('../models/Broker');
const DematAccount = require('../models/DematAccount');
const Transaction = require('../models/Transaction');
const { parseContractPDF, BROKERS } = require('../parsers');
const { buildPreviewContract } = require('../parsers/normalizeContract');

const FUZZY_TOP_N = 5;

/**
 * Lookups adapter — runs the fuzzy/exact DB queries the normalizer needs.
 * Kept inline so unit tests of the normalizer can pass mock implementations.
 */
const buildLookups = () => ({
  fuzzyMatchSecurities: async (rawSymbol) => {
    if (!rawSymbol) return [];
    const tokens = rawSymbol.split(/\s+/).filter((t) => t.length >= 2);
    if (tokens.length === 0) return [];
    const orConditions = tokens.map((t) => ({ name: { $regex: escapeRegex(t), $options: 'i' } }));
    const results = await Security.find({ $or: orConditions })
      .limit(FUZZY_TOP_N * 3)
      .lean();
    return results.slice(0, FUZZY_TOP_N).map((s) => ({ _id: s._id, name: s.name, type: s.type }));
  },

  fuzzyMatchUserAccount: async (rawName) => {
    if (!rawName) return null;
    const tokens = rawName.split(/\s+/).filter(Boolean).slice(0, 2);
    if (tokens.length === 0) return null;
    const orConditions = tokens.map((t) => ({ name: { $regex: escapeRegex(t), $options: 'i' } }));
    const candidates = await UserAccount.find({ $or: orConditions }).limit(5).lean();
    let best = null;
    let bestScore = 0;
    for (const c of candidates) {
      const score = tokens.filter((t) => c.name.toLowerCase().includes(t.toLowerCase())).length;
      if (score > bestScore) {
        best = c;
        bestScore = score;
      }
    }
    return best ? { _id: best._id, name: best.name, panNumber: best.panNumber } : null;
  },

  findDematByUserAndBroker: async (userAccountId, brokerCode) => {
    const broker = await fuzzyMatchBroker(brokerCode);
    if (!broker) return null;
    const demat = await DematAccount.findOne({ userAccountId, brokerId: broker._id })
      .populate('brokerId', 'name')
      .lean();
    if (!demat) return null;
    return { _id: demat._id, brokerId: demat.brokerId._id, brokerName: demat.brokerId.name };
  }
});

const fuzzyMatchBroker = async (brokerCode) => {
  const codeToTokens = {
    [BROKERS.WADIWALA]: ['wadiwala'],
    [BROKERS.SGSSL]: ['south gujarat', 'sgssl']
  };
  const tokens = codeToTokens[brokerCode] || [];
  for (const t of tokens) {
    const broker = await Broker.findOne({ name: { $regex: escapeRegex(t), $options: 'i' } }).lean();
    if (broker) return broker;
  }
  return null;
};

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Parse a broker contract PDF and return one or more parsed contracts.
 *
 * The frontend takes this output, lets the user pick a contract (when
 * multiple), pre-fills the existing AddTransaction form, and saves via the
 * regular POST /transaction/create flow. There is no separate confirm
 * endpoint and no source-PDF persistence — the buffer is parsed in memory
 * and discarded.
 */
const previewContract = async (buffer, fileName) => {
  const { broker, rawContracts } = await parseContractPDF(buffer);
  const lookups = buildLookups();

  const previews = [];
  for (const raw of rawContracts) {
    const preview = await buildPreviewContract(raw, lookups);
    previews.push(preview);
  }

  // Flag contracts that would create duplicate referenceNumber+demat
  // combinations so the UI can warn before the user submits.
  for (const p of previews) {
    if (p.matchedDematAccount?._id && p.contractNoteNo) {
      const existing = await Transaction.findOne({
        referenceNumber: p.contractNoteNo,
        dematAccountId: p.matchedDematAccount._id
      }).lean();
      if (existing) {
        p.warnings.push(`Contract ${p.contractNoteNo} already imported for this demat account`);
        p.duplicate = true;
      }
    }
  }

  return { fileName, broker, contracts: previews };
};

module.exports = { previewContract };
