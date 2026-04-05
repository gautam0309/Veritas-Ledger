/*
 * ============================================================================
 * FILE: web-app/middleware/validator-middleware.js
 * ============================================================================
 * 
 * PURPOSE:
 *   Contains shared input sanitization and validation chains.
 *   Prevents malformed data (like bad emails) and XSS attacks (like HTML 
 *   tags being typed into the Name field) from entering the MongoDB database.
 * ============================================================================
 */

const { body } = require('express-validator');

// WHAT: Same regex logic as password-validator.js
const passwordValidation = body('password')
    .isLength({ min: 8, max: 128 })
    .withMessage('Password must be between 8 and 128 characters')
    .matches(/\d/)
    .withMessage('Password must contain at least one number')
    .matches(/[a-z]/)
    .withMessage('Password must contain at least one lowercase letter')
    .matches(/[A-Z]/)
    .withMessage('Password must contain at least one uppercase letter');

// WHAT: Validates the shape of the email string
const emailValidation = body('email')
    .isEmail()
    .withMessage('Invalid Email Address');

/*
 * ===== FUNCTION: nameValidation =====
 * WHAT: Secures the arbitrary user name string.
 * HOW IT WORKS:
 *   .not().isEmpty() => Rejects pure whitespace / blank names.
 *   .trim() => Removes accidental spaces before or after the name (" John " -> "John").
 *   .escape() => The most important part! Converts `<` and `>` characters into HTML entities.
 *                Example: if a hacker types `<script>`, it saves as `&lt;script&gt;`.
 */
const nameValidation = body('name')
    .not()
    .isEmpty()
    .withMessage('Name is required')
    .trim()
    .escape();


// WHAT: Combines individual field rules into arrays that Express routes can attach as middleware
const universityRegistrationValidation = [
    nameValidation,
    emailValidation,
    passwordValidation,
    // The University form has an extra field called "location". We sanitize it inline.
    body('location').not().isEmpty().withMessage('Location is required').trim().escape()
];

const studentRegistrationValidation = [
    nameValidation,
    emailValidation,
    passwordValidation
];

module.exports = {
    passwordValidation,
    emailValidation,
    nameValidation,
    universityRegistrationValidation,
    studentRegistrationValidation
};
