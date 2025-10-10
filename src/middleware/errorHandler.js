const logger = require('../utils/logger');
const ApiResponse = require('../utils/response');

const errorHandler = (err, req, res, next) => {
  // Service layer errors (errors with statusCode property)
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal server error';
  const reasonCode = err.reasonCode || 'INTERNAL_SERVER_ERROR';

  // Log the error
  logger.error(`Error: ${message}`, {
    stack: err.stack,
  });

  // Prepare additional data
  const additionalData = {};
  if (err.field) additionalData.field = err.field;

  return ApiResponse.error(res, message, statusCode, reasonCode, additionalData);
};

module.exports = errorHandler;