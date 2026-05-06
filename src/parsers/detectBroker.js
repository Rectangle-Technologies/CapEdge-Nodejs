const BROKERS = {
  SGSSL: 'sgssl',
  WADIWALA: 'wadiwala'
};

const detectBroker = (text) => {
  const upper = (text || '').toUpperCase();
  // SGSSL header appears at the top of every page — check just the first 4000 chars.
  const head = upper.slice(0, 4000);
  if (head.includes('SOUTH GUJARAT SHARES') || head.includes('SGSSL')) {
    return BROKERS.SGSSL;
  }
  // Wadiwala's company name is only in a logo image; the text identifier
  // "R.WADIWALA SECURITIES PVT.LTD." appears in the footer of page 1 which
  // can be far beyond 4000 chars in multi-page PDFs — search the full text.
  if (upper.includes('R.WADIWALA') || upper.includes('R. WADIWALA') || upper.includes('WADIWALA SECURITIES')) {
    return BROKERS.WADIWALA;
  }
  return null;
};

module.exports = { detectBroker, BROKERS };
