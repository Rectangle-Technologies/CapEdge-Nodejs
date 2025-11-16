/**
 * Utility functions for the application
 */

/**
 * Calculate pagination metadata
 * @param {number} total - Total number of records
 * @param {number} limit - Number of records per page
 * @param {number} offset - Number of records to skip
 * @returns {Object} Pagination metadata
 */
const calculatePagination = (total, limit, offset) => {
  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.ceil(total / limit);
  
  return {
    total,
    count: Math.min(limit, total - offset),
    limit: parseInt(limit),
    offset: parseInt(offset),
    currentPage,
    totalPages,
    hasNextPage: currentPage < totalPages,
    hasPreviousPage: currentPage > 1
  };
};

/**
 * Calculate capital gain type based on holding period
 * @param {Date} buyDate - Buy date
 * @param {Date} sellDate - Sell date
 * @param {string} securityType - Type of security
 * @returns {string} STCG or LTCG
 */
const calculateCapitalGainType = (buyDate, sellDate, securityType = 'EQUITY') => {
  const holdingPeriodDays = Math.ceil((sellDate - buyDate) / (1000 * 60 * 60 * 24));
  
  if (securityType === 'EQUITY') {
    return holdingPeriodDays >= 365 ? 'LTCG' : 'STCG';
  } else {
    // For non-equity securities
    return holdingPeriodDays >= 1095 ? 'LTCG' : 'STCG'; // 3 years
  }
};

/**
 * Format number to 2 decimal places
 * @param {number} num - Number to format
 * @returns {number} Formatted number
 */
const formatCurrency = (num) => {
  return Math.round(num * 100) / 100;
};

/**
 * Generate transaction reference number
 * @returns {string} Reference number
 */
const generateReferenceNumber = () => {
  const timestamp = Date.now().toString();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `TXN${timestamp.slice(-6)}${random}`;
};

/**
 * Validate PAN number format
 * @param {string} pan - PAN number
 * @returns {boolean} Is valid PAN
 */
const isValidPAN = (pan) => {
  const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
  return panRegex.test(pan);
};

/**
 * Build MongoDB query from request query parameters
 * @param {Object} query - Request query object
 * @param {Array} allowedFields - Allowed filter fields
 * @returns {Object} MongoDB query object
 */
const buildQuery = (query, allowedFields = []) => {
  const mongoQuery = {};
  
  allowedFields.forEach(field => {
    if (query[field]) {
      if (field.includes('Date')) {
        // Handle date range queries
        if (field === 'startDate') {
          mongoQuery.date = { ...mongoQuery.date, $gte: new Date(query[field]) };
        } else if (field === 'endDate') {
          mongoQuery.date = { ...mongoQuery.date, $lte: new Date(query[field]) };
        }
      } else if (field === 'name') {
        // Handle text search
        mongoQuery[field] = { $regex: query[field], $options: 'i' };
      } else {
        // Handle exact matches
        mongoQuery[field] = query[field];
      }
    }
  });
  
  return mongoQuery;
};

/**
 * Get default pagination values
 * @param {Object} query - Request query object
 * @returns {Object} Pagination values
 */
const getPaginationValues = (query) => {
  const limit = parseInt(query.limit) || parseInt(process.env.DEFAULT_PAGE_SIZE) || 50;
  const offset = parseInt(query.offset) || 0;
  const maxLimit = parseInt(process.env.MAX_PAGE_SIZE) || 100;
  
  return {
    limit: Math.min(limit, maxLimit),
    offset: Math.max(offset, 0)
  };
};

const getGainType = (buyDate, sellDate) => {
  const buyYear = buyDate.getFullYear();
  const sellYear = sellDate.getFullYear();
  if (sellYear - buyYear > 1) {
    return 'LTCG';
  } else if (sellYear - buyYear === 1) {
    if (sellDate.getMonth() > buyDate.getMonth() || 
        (sellDate.getMonth() === buyDate.getMonth() && sellDate.getDate() >= buyDate.getDate())) {
      return 'LTCG';
    }
  }
  return 'STCG';
}

module.exports = {
  calculatePagination,
  calculateCapitalGainType,
  formatCurrency,
  generateReferenceNumber,
  isValidPAN,
  buildQuery,
  getPaginationValues,
  getGainType
};