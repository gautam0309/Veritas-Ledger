/*
 * ============================================================================
 * FILE: web-app/routes/student-router.js
 * ============================================================================
 * 
 * PURPOSE:
 *   Defines all endpoints prefixed with `/student/*`.
 *   Maps student actions (register, login, requesting transcripts) to their 
 *   respective controllers.
 *
 * HOW EXPRESS ROUTERS WORK:
 *   By defining `router.get('/login')` here, but attaching this router to 
 *   `/student` inside `app.js`, the final URL becomes `localhost:4000/student/login`.
 * ============================================================================
 */


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

/*
 * ===== VIEWS (GET ROUTES) =====
 * WHAT: Loads HTML pages for students.
 */
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


/*
 * ===== ACTION PIPELINES (POST ROUTES) =====
 * WHAT: Handles state-changing actions. Same middleware pipelines as Universities.
 */

// REGISTER
router.post('/register/submit', studentRegistrationValidation, validatePasswordRules(), validatePassword, csrfProtection, studentController.postRegisterStudent);

// LOGIN (Protected by strict 15min Rate Limiting)
router.post('/login/submit', limiter.strictRateLimiterMiddleware, csrfProtection, studentController.postLoginStudent);

// REQUEST TRANSCRIPT (New enhancement: Students can send internal messages to Universities)
router.post('/request-transcript', studentMiddleware.authenticateLogin, csrfProtection, studentController.postRequestTranscript);

// HISTORY (Audit logs view)
router.get('/history', studentMiddleware.authenticateLogin, studentController.getVerificationHistory);

// PDF DOWNLOAD (Student specific view of the PDF)
router.get('/certificate/download/:certId', studentMiddleware.authenticateLogin, studentController.downloadCertificatePDF);


module.exports = router;
