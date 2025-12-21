const errorHandler = (err, req, res, next) => {
  // Handle JSON parsing errors from body-parser
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      reasonCode: 'INVALID_JSON',
      message: 'Invalid JSON in request body. Please ensure the request body is valid JSON or leave it empty.'
    });
  }

  // Service layer errors (errors with statusCode property)
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal server error';
  const reasonCode = err.reasonCode || 'INTERNAL_SERVER_ERROR';

  // Log the error
  console.error(`Error: ${message}`, {
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