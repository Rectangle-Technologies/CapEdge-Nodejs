const { validationResult } = require('express-validator');

/**
 * Middleware to handle express-validator validation errors
 * Checks for validation errors and throws a formatted error if any exist
 */
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
        const firstError = errors.array()[0];
        const error = new Error(firstError.msg);
        error.statusCode = 422;
        error.reasonCode = 'VALIDATION_ERROR';
        error.field = firstError.path;
        error.errors = errors.array(); // Include all errors for debugging
        return next(error);
    }
    
    next();
};

module.exports = {
    handleValidationErrors
};
