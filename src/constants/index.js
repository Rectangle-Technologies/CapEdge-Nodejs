/**
 * Global Constants
 * Centralized constants used across the application
 */

// Security Types
const SECURITY_TYPES_ARRAY = ['EQUITY', 'FUTURES', 'OPTIONS', 'COMMODITY', 'CURRENCY', 'BOND', 'ETF', 'MUTUAL_FUND'];

// Derivative security types (require strike price and expiry)
const DERIVATIVE_TYPES = ['OPTIONS', 'FUTURES'];

// Non-derivative security types
const NON_DERIVATIVE_TYPES = ['EQUITY', 'BOND', 'ETF', 'MUTUAL_FUND', 'COMMODITY', 'CURRENCY'];

module.exports = {
  SECURITY_TYPES_ARRAY,
  DERIVATIVE_TYPES,
  NON_DERIVATIVE_TYPES
};