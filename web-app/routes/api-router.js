/*
 * ============================================================================
 * FILE: web-app/routes/api-router.js
 * ============================================================================
 * 
 * PURPOSE:
 *   An API-only routing layer that doesn't return HTML views. 
 *   Used for AJAX calls, JSON responses, or headless integrations.
 * ============================================================================
 */


var express = require('express');
var router = express.Router();
const apiController = require("../controllers/api-controller");
const studentMiddleware = require('../middleware/student-middleware');

/* 
 * ===== ACTION PIPELINES (API ROUTES) ===== 
 */

// WHAT: Generate a Zero Knowledge Proof (JSON array) for a given certificate.
// WHO: Only logged-in students can generate proofs for their own certificates.
router.get('/generateProof', studentMiddleware.authenticateLogin, apiController.getGenerateProof);

// WHAT: Verify a Zero Knowledge Proof.
// WHO: Anyone can verify a proof (no authentication middleware).
router.post('/verify', apiController.postVerifyCert);



// error handler (catches API errors and formats them as standard JSON instead of HTML)
router.use(apiController.apiErrorHandler);

module.exports = router;
