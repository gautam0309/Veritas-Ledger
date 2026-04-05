/*
 * ============================================================================
 * FILE: web-app/middleware/password-validator.js
 * ============================================================================
 * 
 * PURPOSE:
 *   Reusable middleware to enforce strong, standardized passwords across the application.
 *   Built using `express-validator`.
 *
 * HOW IT WORKS:
 *   - Parses the incoming HTTP request.
 *   - Checks the `password` string against strict regex logic.
 *   - Ensures `passwordConfirm` perfectly matches `password`.
 *   - If it fails, intercepts the request and re-renders the registration page 
 *     with a red error message BEFORE the database is touched.
 * ============================================================================
 */


const { body, validationResult } = require('express-validator');

/*
 * ===== FUNCTION: validatePasswordRules =====
 * WHAT: Defines the specific rules that a strong password must follow.
 */
const validatePasswordRules = () => {
    return [
        // password must be between 8 and 128 characters
        body('password')
            .isLength({ min: 8, max: 128 }).withMessage('Password must be between 8 and 128 characters long.')
            // must have at least one numeric digit
            .matches(/\d/).withMessage('Password must contain at least one number.')
            // must have at least one lowercase letter
            .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter.')
            // must have at least one uppercase letter
            .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter.'),
        
        // passwordConfirm must exactly match the password field
        body('passwordConfirm').custom((value, { req }) => {
            if (value !== req.body.password) {
                throw new Error('Passwords do not match');
            }
            return true;
        })
    ];
};

/*
 * ===== FUNCTION: validatePassword =====
 * WHAT: Executes the rules defined above. If the rules are broken, it stops the request
 *   from reaching the controller, and instead sends HTML back to the browser showing the error.
 */
const validatePassword = (req, res, next) => {
    // Collect any errors found by `validatePasswordRules`
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        // We figure out whether the user is a student or a university so we can 
        // render the correct HTML page.
        const isUni = req.originalUrl.includes('university');
        const title = isUni ? "University" : "Student Dashboard";
        const root = isUni ? "university" : "student";
        const template = isUni ? "register-university" : "register-student";

        // Stop the request, render the template, and pass the specific error message to the pug/ejs file
        return res.render(template, {
            title, root,
            logInType: req.session ? req.session.user_type : "none",
            registered: false,
            // errors.array()[0].msg takes the VERY FIRST error message in the list
            error: errors.array()[0].msg
        });
    }
    
    // If no errors, proceed to the actual registration controller logic.
    next();
};

module.exports = {
    validatePasswordRules,
    validatePassword
};
