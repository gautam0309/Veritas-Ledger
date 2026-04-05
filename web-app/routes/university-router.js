/*
 * ============================================================================
 * FILE: web-app/routes/university-router.js
 * ============================================================================
 * 
 * PURPOSE:
 *   Defines all endpoints prefixed with `/university/*`.
 *   Maps URLs to specific controller functions and applies security middleware layer-by-layer.
 *
 * HOW EXPRESS PIPING WORKS:
 *   router.post('/path', middleware1, middleware2, controller logic);
 * ============================================================================
 */


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

// 1. Redirect naked /university to the login page
router.get('/', (req, res) => res.redirect('/university/login'));

/*
 * ===== VIEWS (GET ROUTES) =====
 * WHAT: Loads the HTML templates for the user to see.
 * SECURITY: `redirectToDashboardIfLoggedIn` ensures logged-in users don't see the login page again.
 *           `authenticateLogin` ensures anonymous users cannot see the dashboard.
 */
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

router.get('/logout', universityController.logOutAndRedirect);


/*
 * ===== ACTION PIPELINES (POST ROUTES) =====
 * WHAT: Handles form submissions and data mutation.
 */

// REGISTRATION
// Pipeline: Name/Email Check -> Password Rules Check -> Password Validation Render -> CSRF Check -> Database Registration
router.post('/register/submit', universityRegistrationValidation, validatePasswordRules(), validatePassword, csrfProtection, universityController.postRegisterUniversity);

// LOGIN
// Pipeline: 15min Rate Limiting (Brute force protection) -> CSRF Check -> Database Login check
router.post('/login/submit', limiter.strictRateLimiterMiddleware, csrfProtection, universityController.postLoginUniversity);

// SINGLE ISSUE
// Pipeline: Login Check -> Multer Image Upload -> CSRF Check -> Blockchain Issue logic
router.post("/issue", universityMiddleware.authenticateLogin,
    universityController.upload.single('certificateImage'), // Express-Multer middleware that saves the uploaded file to disk
    csrfProtection,
    universityController.postIssueCertificate);

/*
 * ===== ENHANCED FEATURES =====
 * WHAT: New functionality added to standard Veritas Ledger (Batch Issuance, Revocation, PDF Generation)
 */
router.get('/api/analytics', universityMiddleware.authenticateLogin, universityController.getAnalyticsData);

// REVOKE
router.post('/revoke', universityMiddleware.authenticateLogin, csrfProtection, universityController.postRevokeCertificate);

// PDF DOWNLOAD
router.get('/certificate/download/:certId', universityMiddleware.authenticateLogin, universityController.downloadCertificatePDF);

// BATCH ISSUE (CSV)
router.get('/batch-issue', universityMiddleware.authenticateLogin, universityController.getBatchIssuePage);
router.post('/batch-issue', universityMiddleware.authenticateLogin,
    universityController.csvUpload.single('csvFile'), // Multer configured exclusively for CSV files
    csrfProtection,
    universityController.postBatchIssue);

// BATCH REGISTER STUDENTS (CSV)
router.get('/batch-register', universityMiddleware.authenticateLogin, universityController.getBatchRegisterPage);
router.post('/batch-register', universityMiddleware.authenticateLogin,
    universityController.csvUpload.single('csvFile'),
    csrfProtection,
    universityController.postBatchRegister);

module.exports = router;
