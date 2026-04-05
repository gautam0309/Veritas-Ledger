/*
 * ============================================================================
 * FILE: web-app/middleware/student-middleware.js
 * ============================================================================
 * 
 * PURPOSE:
 *   Route guards specifically for student users. Controls access to student-only
 *   pages and prevents logged-in users from accessing the login page again.
 * ============================================================================
 */

const logger = require('../services/logger');

/*
 * ===== FUNCTION: authenticateLogin =====
 * WHAT: Protects entire URL groups (like /student/dashboard) from unauthenticated users.
 * WHY: If someone tries to visit /student/dashboard without logging in, their session
 *   is missing `user_type === "student"`. This function intercepts that request
 *   and forces them back to the login page.
 */
function authenticateLogin(req, res, next) {
    try {
        if (req.session.user_type === "student") next();
        else return res.redirect('/student/login');
    } catch (e) {
        next(e);
    }
}

/*
 * ===== FUNCTION: redirectToDashboardIfLoggedIn =====
 * WHAT: Protects the login and registration pages from ALREADY logged-in users.
 * WHY: If a user is already logged in, they shouldn't see the login screen again.
 *   If a student visits /student/login, they get pushed to /student/dashboard.
 *   If a university visits /student/login, they get pushed to /university/dashboard.
 */
function redirectToDashboardIfLoggedIn(req, res, next) {
    try {
        if (req.session.user_type === "student") return res.redirect('/student/dashboard');
        if (req.session.user_type === "university") return res.redirect('/university/dashboard');
        
        // If they are NOT logged in, allow them to view the login page.
        next();
    } catch (e) {
        next(e);
    }
}

module.exports = { redirectToDashboardIfLoggedIn, authenticateLogin };