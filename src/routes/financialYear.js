const { body } = require('express-validator');
const financialYearController = require('../controllers/financialYearController');
const { handleValidationErrors } = require('../middleware/validation');

const router = require('express').Router();

const financialYearValidation = [
    body('date')
        .notEmpty().withMessage('Date is required')
        .isISO8601().toDate().withMessage('Date must be a valid ISO 8601 date'),
    body('stcgRate')
        .notEmpty().withMessage('STCG rate is required')
        .isFloat({ min: 0, max: 100 }).withMessage('STCG rate must be between 0 and 100'),
    body('ltcgRate')
        .notEmpty().withMessage('LTCG rate is required')
        .isFloat({ min: 0, max: 100 }).withMessage('LTCG rate must be between 0 and 100')
]

const financialYearUpdateValidation = [
    body('stcgRate')
        .notEmpty().withMessage('STCG rate is required')
        .isFloat({ min: 0, max: 100 }).withMessage('STCG rate must be between 0 and 100'),
    body('ltcgRate')
        .notEmpty().withMessage('LTCG rate is required')
        .isFloat({ min: 0, max: 100 }).withMessage('LTCG rate must be between 0 and 100')
]

router.get('/get-all', financialYearController.getFinancialYears);
// TODO: Remove once transactions are done
router.post('/create', financialYearValidation, handleValidationErrors, financialYearController.createFinancialYear);

router.put('/update/:id', financialYearUpdateValidation, handleValidationErrors, financialYearController.updateFinancialYear);

module.exports = router;