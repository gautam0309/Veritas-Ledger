const { body } = require('express-validator');

const passwordValidation = body('password')
    .isLength({ min: 8, max: 128 })
    .withMessage('Password must be between 8 and 128 characters')
    .matches(/\d/)
    .withMessage('Password must contain at least one number')
    .matches(/[a-z]/)
    .withMessage('Password must contain at least one lowercase letter')
    .matches(/[A-Z]/)
    .withMessage('Password must contain at least one uppercase letter');

const emailValidation = body('email')
    .isEmail()
    .withMessage('Invalid Email Address');

const nameValidation = body('name')
    .not()
    .isEmpty()
    .withMessage('Name is required')
    .trim()
    .escape();

const universityRegistrationValidation = [
    nameValidation,
    emailValidation,
    passwordValidation,
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
