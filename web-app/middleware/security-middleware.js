const crypto = require('crypto');
const logger = require('../services/logger');

/**
 * Custom CSRF protection middleware.
 * Verifies a token sent in headers for state-changing requests.
 */
function csrfProtection(req, res, next) {
    // Methods that require CSRF protection
    const protectedMethods = ['POST', 'PUT', 'DELETE', 'PATCH'];

    if (!protectedMethods.includes(req.method)) {
        return next();
    }

    // Exempt specific routes if needed (e.g., external webhooks)
    const exemptRoutes = ['/api/verify']; // Example
    if (exemptRoutes.some(route => req.path.startsWith(route))) {
        return next();
    }

    const tokenFromHeader = req.get('X-XSRF-Token');
    const tokenFromBody = req.body._csrf;
    const tokenFromSession = req.session.csrfToken;

    if (!tokenFromSession || (tokenFromHeader !== tokenFromSession && tokenFromBody !== tokenFromSession)) {
        logger.warn(`Potential CSRF attack detected. Path: ${req.path}, IP: ${req.ip}`);
        return res.status(403).json({
            error: "Forbidden",
            message: "Missing or invalid CSRF token. Please refresh the page and try again."
        });
    }

    next();
}

/**
 * Middleware to generate a CSRF token and attach it to the session and locals.
 */
function generateCsrfToken(req, res, next) {
    if (!req.session.csrfToken) {
        req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    }
    res.locals.csrfToken = req.session.csrfToken;
    next();
}

/**
 * Middleware to bind the session to the client's User-Agent.
 * Prevents basic session hijacking where a cookie is used from a different browser.
 */
function bindSessionToClient(req, res, next) {
    const userAgent = req.get('User-Agent');

    if (!req.session.userAgent) {
        req.session.userAgent = userAgent;
    } else if (req.session.userAgent !== userAgent) {
        logger.warn(`Session hijack attempt? User-Agent mismatch. Session: ${req.session.userAgent}, Request: ${userAgent}`);
        // Log out the user if the browser suddenly changes mid-session
        req.session.destroy();
        return res.redirect('/university/login?error=session_expired');
    }

    next();
}

/**
 * Middleware to generate a cryptographic nonce for CSP.
 */
function generateNonce(req, res, next) {
    res.locals.nonce = crypto.randomBytes(16).toString('base64');
    next();
}

module.exports = {
    csrfProtection,
    generateCsrfToken,
    bindSessionToClient,
    generateNonce
};
