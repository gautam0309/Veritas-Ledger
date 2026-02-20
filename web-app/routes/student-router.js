const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const studentController = require('../controllers/student-controller');
const studentMiddleware = require('../middleware/student-middleware');
const limiter = require('../middleware/rate-limiter-middleware');
const { studentRegistrationValidation } = require('../middleware/validator-middleware');
const { csrfProtection } = require('../middleware/security-middleware');
const { validatePasswordRules, validatePassword } = require('../middleware/password-validator');
let title = "Student Dashboard";
let root = "student";

router.get('/dashboard', studentMiddleware.authenticateLogin, studentController.getDashboard);

router.get('/register', studentMiddleware.redirectToDashboardIfLoggedIn, function (req, res, next) {
    res.render('register-student', {
        title, root,
        logInType: req.session.user_type || "none"
    });
});

router.get('/login', studentMiddleware.redirectToDashboardIfLoggedIn, function (req, res, next) {
    res.render('login-student', {
        title, root,
        logInType: req.session.user_type || "none"
    })
});

router.get('/logout', studentController.logOutAndRedirect);

router.post('/register/submit', studentRegistrationValidation, validatePasswordRules(), validatePassword, csrfProtection, studentController.postRegisterStudent);

router.post('/login/submit', limiter.strictRateLimiterMiddleware, csrfProtection, studentController.postLoginStudent);

router.post('/request-transcript', studentMiddleware.authenticateLogin, csrfProtection, studentController.postRequestTranscript);

router.get('/history', studentMiddleware.authenticateLogin, studentController.getVerificationHistory);

router.get('/certificate/download/:certId', studentMiddleware.authenticateLogin, studentController.downloadCertificatePDF);


module.exports = router;
