const { body, validationResult } = require('express-validator');

const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
    }
    next();
};

const familyValidation = [
    body('familyName').trim().notEmpty().withMessage('Family name is required')
        .isLength({ min: 2, max: 50 }).withMessage('Family name must be 2-50 characters'),
    body('userId').optional().isString(),
    handleValidationErrors,
];

const joinFamilyValidation = [
    body('inviteCode').trim().notEmpty().withMessage('Invite code is required')
        .isLength({ min: 4, max: 10 }).withMessage('Invite code must be 4-10 characters'),
    body('userId').optional().isString(),
    handleValidationErrors,
];

const transferAdminValidation = [
    body('userId').trim().notEmpty().withMessage('User ID is required'),
    handleValidationErrors,
];

const profileValidation = [
    body('displayName').trim().notEmpty().withMessage('Display name is required')
        .isLength({ min: 2, max: 50 }).withMessage('Display name must be 2-50 characters'),
    handleValidationErrors,
];

const transactionValidation = [
    body('familyId').trim().notEmpty().withMessage('Family ID is required'),
    body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be a positive number'),
    body('type').isIn(['income', 'expense']).withMessage('Type must be income or expense'),
    body('category').trim().notEmpty().withMessage('Category is required')
        .isLength({ max: 50 }).withMessage('Category too long'),
    body('description').optional().trim().isLength({ max: 500 }).withMessage('Description too long'),
    body('date').optional().isISO8601().withMessage('Invalid date format'),
    body('paymentMethod').optional({ values: 'null' }).trim().isLength({ max: 30 }).withMessage('Payment method too long'),
    body('source').optional().isIn(['manual', 'sms']).withMessage('Source must be manual or sms'),
    body('dedupeKey').optional({ values: 'null' }).isString().isLength({ max: 200 }).withMessage('Dedupe key too long'),
    handleValidationErrors,
];

const transactionUpdateValidation = [
    body('amount').optional().isFloat({ min: 0.01 }).withMessage('Amount must be a positive number'),
    body('type').optional().isIn(['income', 'expense']).withMessage('Type must be income or expense'),
    body('category').optional().trim().notEmpty().withMessage('Category is required')
        .isLength({ max: 50 }).withMessage('Category too long'),
    body('description').optional().trim().isLength({ max: 500 }).withMessage('Description too long'),
    body('date').optional().isISO8601().withMessage('Invalid date format'),
    body('paymentMethod').optional({ values: 'null' }).trim().isLength({ max: 30 }).withMessage('Payment method too long'),
    handleValidationErrors,
];

const goalValidation = [
    body('familyId').trim().notEmpty().withMessage('Family ID is required'),
    body('title').trim().notEmpty().withMessage('Title is required')
        .isLength({ min: 2, max: 100 }).withMessage('Title must be 2-100 characters'),
    body('targetAmount').isFloat({ min: 0.01 }).withMessage('Target amount must be positive'),
    body('deadline').optional().isISO8601().withMessage('Invalid deadline format'),
    handleValidationErrors,
];

const goalEditValidation = [
    body('title').optional().trim().notEmpty().withMessage('Title is required')
        .isLength({ min: 2, max: 100 }).withMessage('Title must be 2-100 characters'),
    body('targetAmount').optional().isFloat({ min: 0.01 }).withMessage('Target amount must be positive'),
    body('deadline').optional({ values: 'null' }).isISO8601().withMessage('Invalid deadline format'),
    handleValidationErrors,
];

const goalUpdateValidation = [
    body('goalId').trim().notEmpty().withMessage('Goal ID is required'),
    body('amount').isFloat().withMessage('Amount must be a number'),
    handleValidationErrors,
];

const loanValidation = [
    body('familyId').trim().notEmpty().withMessage('Family ID is required'),
    body('direction').optional().isIn(['lent', 'borrowed']).withMessage('Direction must be lent or borrowed'),
    body('person').trim().notEmpty().withMessage('Person is required')
        .isLength({ max: 80 }).withMessage('Name too long'),
    body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be a positive number'),
    body('dueDate').optional({ values: 'null' }).isISO8601().withMessage('Invalid due date format'),
    body('note').optional().trim().isLength({ max: 300 }).withMessage('Note too long'),
    handleValidationErrors,
];

const loanUpdateValidation = [
    body('person').optional().trim().notEmpty().withMessage('Person is required')
        .isLength({ max: 80 }).withMessage('Name too long'),
    body('amount').optional().isFloat({ min: 0.01 }).withMessage('Amount must be a positive number'),
    body('dueDate').optional({ values: 'null' }).isISO8601().withMessage('Invalid due date format'),
    body('note').optional().trim().isLength({ max: 300 }).withMessage('Note too long'),
    handleValidationErrors,
];

const loanRepayValidation = [
    body('amount').optional().isFloat({ min: 0.01 }).withMessage('Amount must be a positive number'),
    handleValidationErrors,
];

const budgetValidation = [
    body('familyId').trim().notEmpty().withMessage('Family ID is required'),
    body('category').trim().notEmpty().withMessage('Category is required')
        .isLength({ max: 50 }).withMessage('Category too long'),
    body('limit').isFloat({ min: 0.01 }).withMessage('Limit must be a positive number'),
    handleValidationErrors,
];

const registerValidation = [
    body('email').isEmail().withMessage('Valid email is required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('displayName').trim().notEmpty().withMessage('Display name is required')
        .isLength({ min: 2, max: 50 }).withMessage('Display name must be 2-50 characters'),
    handleValidationErrors,
];

module.exports = {
    familyValidation,
    joinFamilyValidation,
    transferAdminValidation,
    profileValidation,
    transactionValidation,
    transactionUpdateValidation,
    goalValidation,
    goalEditValidation,
    goalUpdateValidation,
    loanValidation,
    loanUpdateValidation,
    loanRepayValidation,
    budgetValidation,
    registerValidation,
    handleValidationErrors,
};
