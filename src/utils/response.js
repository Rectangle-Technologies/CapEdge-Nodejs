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
   * Send a created response (201)
   * @param {Object} res - Express response object
   * @param {*} data - Response data
   * @param {string} message - Success message
   */
  static created(res, data, message = 'Resource created successfully') {
    return ApiResponse.success(res, data, message, 201);
  }

}

module.exports = ApiResponse;
