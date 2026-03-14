// Reusable middleware to enforce strong passwords consistently via express-validator
const { body, validationResult } = require('express-validator');

const validatePasswordRules = () => {
    return [
        body('password')
            .isLength({ min: 8, max: 128 }).withMessage('Password must be between 8 and 128 characters long.')
            .matches(/\d/).withMessage('Password must contain at least one number.')
            .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter.')
            .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter.'),
        body('passwordConfirm').custom((value, { req }) => {
            if (value !== req.body.password) {
                throw new Error('Passwords do not match');
            }
            return true;
        })
    ];
};

const validatePassword = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        const isUni = req.originalUrl.includes('university');
        const title = isUni ? "University" : "Student Dashboard";
        const root = isUni ? "university" : "student";
        const template = isUni ? "register-university" : "register-student";

        return res.render(template, {
            title, root,
            logInType: req.session ? req.session.user_type : "none",
            registered: false,
            error: errors.array()[0].msg
        });
    }
    next();
};

module.exports = {
    validatePasswordRules,
    validatePassword
};
