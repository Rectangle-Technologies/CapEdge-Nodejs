const BROKERS = {
  SGSSL: 'sgssl',
  WADIWALA: 'wadiwala'
};

const detectBroker = (text) => {
  const head = (text || '').slice(0, 4000).toUpperCase();
  if (head.includes('SOUTH GUJARAT SHARES') || head.includes('SGSSL')) {
    return BROKERS.SGSSL;
  }
  if (head.includes('R.WADIWALA') || head.includes('R. WADIWALA') || head.includes('WADIWALA SECURITIES')) {
    return BROKERS.WADIWALA;
  }
  return null;
};

module.exports = { detectBroker, BROKERS };
