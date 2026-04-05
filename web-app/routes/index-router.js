/*
 * ============================================================================
 * FILE: web-app/routes/index-router.js
 * ============================================================================
 * 
 * PURPOSE:
 *   Handles the root URL path ('/') of the web application.
 *   Serves the main public-facing landing page.
 * ============================================================================
 */

const express = require('express');
const router = express.Router();

let title = "Blockchain Certificate";
let root = "index";

/* GET home page. */

/*
 * ===== ROUTE: GET / =====
 * WHAT: Loads the primary `index.ejs` file.
 * WHY: Passes `logInType` so the frontend navigation bar knows whether to show
 *   "Login" buttons (if "none") or "Dashboard" buttons (if "student"/"university").
 */
router.get('/', function(req, res, next) { 
    res.render('index', {   
        title, root,
        logInType: req.session.user_type || "none"
    });
});

module.exports = router;
