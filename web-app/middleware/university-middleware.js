/*
 * ============================================================================
 * FILE: web-app/middleware/university-middleware.js
 * ============================================================================
 * 
 * PURPOSE:
 *   Route guards specifically for university users. Controls access to university-only
 *   pages (like issuing certificates) and prevents logged-in users from accessing 
 *   the university login page again.
 * ============================================================================
 */


const logger = require('../services/logger');

/*
 * ===== FUNCTION: authenticateLogin =====
 * WHAT: Protects entire URL groups (like /university/dashboard) from unauthenticated users.
 * WHY: Only universities can issue certificates. If someone tries to visit that URL 
 *   without logging in as a university, this intercepts that request and forces them 
 *   back to the university login page.
 */
function authenticateLogin(req, res, next) {
    try {
        if (req.session.user_type === "university") next();
        else return res.redirect('/university/login');
    } catch (e) {
        next(e);
    }
}

/*
 * ===== FUNCTION: redirectToDashboardIfLoggedIn =====
 * WHAT: Protects the login and registration pages from ALREADY logged-in users.
 * WHY: If a university is already logged in, they shouldn't see the login screen again.
 *   If a university visits /university/login, they get pushed to /university/dashboard.
 *   If a student visits /university/login, they get pushed to /student/dashboard.
 */
function redirectToDashboardIfLoggedIn(req, res, next) {
    try {
        if (req.session.user_type === "university") return res.redirect('/university/dashboard');
        if (req.session.user_type === "student") return res.redirect('/student/dashboard');
        
        // If they are NOT logged in, allow them to view the login page.
        next();
    } catch (e) {
        next(e);
    }
}


module.exports = { authenticateLogin, redirectToDashboardIfLoggedIn };
