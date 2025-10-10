/**
 * API Response Utility Class
 * Standardizes all API responses across the application
 */

class ApiResponse {
  /**
   * Send a success response
   * @param {Object} res - Express response object
   * @param {*} data - Response data
   * @param {string} message - Success message
   * @param {number} statusCode - HTTP status code (default: 200)
   */
  static success(res, data = null, message = 'Success', statusCode = 200) {
    const response = {
      success: true,
      data,
      message
    };

    return res.status(statusCode).json(response);
  }

  /**
   * Send an error response
   * @param {Object} res - Express response object
   * @param {string} message - Error message
   * @param {number} statusCode - HTTP status code (default: 500)
   * @param {string} reasonCode - Error reason code
   * @param {Object} additionalData - Any additional error data (e.g., field, errors array)
   */
  static error(res, message = 'Internal server error', statusCode = 500, reasonCode = 'INTERNAL_SERVER_ERROR', additionalData = {}) {
    const response = {
      success: false,
      reasonCode,
      message,
      ...additionalData
    };

    return res.status(statusCode).json(response);
  }

  /**
   * Send a created response (201)
   * @param {Object} res - Express response object
   * @param {*} data - Response data
   * @param {string} message - Success message
   */
  static created(res, data, message = 'Resource created successfully') {
    return ApiResponse.success(res, data, message, 201);
  }

  /**
   * Send a validation error response (422)
   * @param {Object} res - Express response object
   * @param {string} message - Error message
   * @param {string} field - Field that failed validation (optional)
   * @param {Array} errors - Array of validation errors (optional)
   */
  static validationError(res, message = 'Validation failed', field = null, errors = null) {
    const additionalData = {};
    if (field) additionalData.field = field;
    if (errors) additionalData.errors = errors;

    return ApiResponse.error(res, message, 422, 'BAD_REQUEST', additionalData);
  }

  /**
   * Send a not found response (404)
   * @param {Object} res - Express response object
   * @param {string} message - Error message
   */
  static notFound(res, message = 'Resource not found') {
    return ApiResponse.error(res, message, 404, 'NOT_FOUND');
  }

  /**
   * Send an unauthorized response (401)
   * @param {Object} res - Express response object
   * @param {string} message - Error message
   */
  static unauthorized(res, message = 'Unauthorized') {
    return ApiResponse.error(res, message, 401, 'UNAUTHORIZED');
  }

  /**
   * Send a forbidden response (403)
   * @param {Object} res - Express response object
   * @param {string} message - Error message
   */
  static forbidden(res, message = 'Forbidden') {
    return ApiResponse.error(res, message, 403, 'FORBIDDEN');
  }

  /**
   * Send a bad request response (400)
   * @param {Object} res - Express response object
   * @param {string} message - Error message
   */
  static badRequest(res, message = 'Bad request') {
    return ApiResponse.error(res, message, 400, 'BAD_REQUEST');
  }
}

module.exports = ApiResponse;
