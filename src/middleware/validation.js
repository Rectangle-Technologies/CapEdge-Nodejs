const { validationResult } = require('express-validator');
const FinancialYear = require('../models/FinancialYear');

const REPORT_FY_CUTOFF = new Date('2026-04-01');

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
        return next(error);
    }
    
    next();
};

const validateFinancialYearAccess = async (req, res, next) => {
    const financialYearId = req.body?.financialYearId || req.query?.financialYearId;
    if (!financialYearId) {
        return next();
    }

    try {
        const financialYear = await FinancialYear.findById(financialYearId).select('startDate');
        if (!financialYear) {
            const error = new Error('Financial Year not found');
            error.statusCode = 404;
            error.reasonCode = 'NOT_FOUND';
            return next(error);
        }

        if (financialYear.startDate < REPORT_FY_CUTOFF) {
            const error = new Error('Reports cannot be exported for financial years prior to FY 2026-27');
            error.statusCode = 403;
            error.reasonCode = 'FORBIDDEN';
            return next(error);
        }

        next();
    } catch (err) {
        next(err);
    }
};

module.exports = {
    handleValidationErrors,
    validateFinancialYearAccess
};
