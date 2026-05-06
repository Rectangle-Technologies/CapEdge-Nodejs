const { extractPDF } = require('./pdfExtract');
const { detectBroker, BROKERS } = require('./detectBroker');
const { parseWadiwala } = require('./wadiwala');
const { parseSGSSL } = require('./sgssl');

const parseContractPDF = async (buffer) => {
  const extracted = await extractPDF(buffer);
  const broker = detectBroker(extracted.fullText);

  if (!broker) {
    const error = new Error('Unrecognized contract format. Supported brokers: SGSSL, R. Wadiwala.');
    error.statusCode = 400;
    error.reasonCode = 'UNRECOGNIZED_FORMAT';
    throw error;
  }

  let rawContracts;
  switch (broker) {
    case BROKERS.WADIWALA:
      rawContracts = parseWadiwala(extracted);
      break;
    case BROKERS.SGSSL:
      rawContracts = parseSGSSL(extracted);
      break;
    default: {
      const error = new Error(`Parser for ${broker} not implemented`);
      error.statusCode = 501;
      throw error;
    }
  }

  return { broker, rawContracts };
};

module.exports = { parseContractPDF, BROKERS };
