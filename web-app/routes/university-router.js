const express = require('express');
const router = express.Router();
const { check } = require('express-validator');
const universityController = require('../controllers/university-controller');
const universityMiddleware = require('../middleware/university-middleware');
const limiter = require('../middleware/rate-limiter-middleware');
const { universityRegistrationValidation } = require('../middleware/validator-middleware');
const { csrfProtection } = require('../middleware/security-middleware');
const { validatePasswordRules, validatePassword } = require('../middleware/password-validator');

let title = "University";
let root = "university";

router.get('/', (req, res) => res.redirect('/university/login'));

router.get('/register', universityMiddleware.redirectToDashboardIfLoggedIn, function (req, res, next) {
    res.render('register-university', {
        title, root,
        logInType: req.session.user_type || "none"
    });
});

router.get('/login', universityMiddleware.redirectToDashboardIfLoggedIn, function (req, res, next) {
    res.render('login-university', {
        title, root,
        logInType: req.session.user_type || "none"
    })
});

router.get('/dashboard', universityMiddleware.authenticateLogin, universityController.getDashboard);

router.get('/issue', universityMiddleware.authenticateLogin, function (req, res, next) {
    res.render('issue-university', {
        title, root,
        logInType: req.session.user_type || "none"
    })
});

router.post("/issue", universityMiddleware.authenticateLogin,
    universityController.upload.single('certificateImage'),
    csrfProtection,
    universityController.postIssueCertificate);

router.post('/register/submit', universityRegistrationValidation, validatePasswordRules(), validatePassword, csrfProtection, universityController.postRegisterUniversity);

router.post('/login/submit', limiter.strictRateLimiterMiddleware, csrfProtection, universityController.postLoginUniversity);

router.get('/logout', universityController.logOutAndRedirect);

// New routes for enhancements
router.get('/api/analytics', universityMiddleware.authenticateLogin, universityController.getAnalyticsData);
router.post('/revoke', universityMiddleware.authenticateLogin, csrfProtection, universityController.postRevokeCertificate);
router.get('/certificate/download/:certId', universityMiddleware.authenticateLogin, universityController.downloadCertificatePDF);
router.get('/batch-issue', universityMiddleware.authenticateLogin, universityController.getBatchIssuePage);
router.post('/batch-issue', universityMiddleware.authenticateLogin,
    universityController.csvUpload.single('csvFile'),
    csrfProtection,
    universityController.postBatchIssue);

router.get('/batch-register', universityMiddleware.authenticateLogin, universityController.getBatchRegisterPage);
router.post('/batch-register', universityMiddleware.authenticateLogin,
    universityController.csvUpload.single('csvFile'),
    csrfProtection,
    universityController.postBatchRegister);

module.exports = router;
