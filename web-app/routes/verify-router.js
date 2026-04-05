/*
 * ============================================================================
 * FILE: web-app/routes/verify-router.js
 * ============================================================================
 * 
 * PURPOSE:
 *   Defines endpoints prefixed with `/verify/*`.
 *   This is the PUBLIC portal where employers, background check agencies, 
 *   or anyone can verify the authenticity of a certificate.
 *
 * NOTE ON SECURITY:
 *   Notice that `authenticateLogin` is NOT used here. This is fully public.
 *   However, we DO use rate-limiting to prevent hackers from spam-querying 
 *   the blockchain.
 * ============================================================================
 */


const express = require('express');
const router = express.Router();
const verifyController = require('../controllers/verify-controller');
const universityController = require('../controllers/university-controller');
const limiter = require('../middleware/rate-limiter-middleware');

let title = "Verification Portal";
let root = "verify";

/*
 * ===== VIEWS (GET ROUTES) =====
 * WHAT: Loads the primary Verification UI.
 */
router.get('/', function (req, res, next) {
    res.render('verify', {
        title, root,
        logInType: req.session.user_type || "none"
    });
});

/*
 * ===== ACTION PIPELINES (POST ROUTES) =====
 */

// VERIFY BY UUID
// Pipeline: Rate Limiter (20 req/s) -> Verification Controller
router.post('/', limiter.rateLimiterMiddlewareInMemory, verifyController.postVerify);

// VERIFY BY ROLL NUMBER (New enhancement)
router.post('/rollnumber', limiter.rateLimiterMiddlewareInMemory, verifyController.postVerifyByRollNumber);

// BULK VERIFICATION (New enhancement: Employers can upload a CSV of UUIDs)
router.get('/bulk', verifyController.getBulkVerifyPage);
router.post('/bulk', limiter.rateLimiterMiddlewareInMemory, universityController.csvUpload.single('csvFile'), verifyController.postBulkVerify);

module.exports = router;
