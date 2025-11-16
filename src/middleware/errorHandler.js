const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
  // Service layer errors (errors with statusCode property)
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal server error';
  const reasonCode = err.reasonCode || 'INTERNAL_SERVER_ERROR';

  // Log the error
  logger.error(`Error: ${message}`, {
    stack: err.stack ? err.stack.split('\n').map(line => line.trim()).join('\n    ') : 'No stack trace available',
  });

  // Prepare additional data
  const additionalData = {};
  if (err.field) additionalData.field = err.field;
  if (err.errors) additionalData.errors = err.errors;

  const response = {
    success: false,
    reasonCode,
    message,
    ...additionalData
  };

  return res.status(statusCode).json(response);
};

module.exports = errorHandler;