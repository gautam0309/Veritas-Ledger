const crypto = require('crypto');
const logger = require('../services/logger');

/*
 * ============================================================================
 * FILE: web-app/middleware/security-middleware.js
 * ============================================================================
 * 
 * PURPOSE:
 *   Contains custom security middleware functions to protect against common web 
 *   vulnerabilities such as CSRF (Cross-Site Request Forgery) and Session Hijacking.
 *
 * HOW IT WORKS (Middleware basics):
 *   - "Middleware" in Express.js is a function that runs *before* the final route handler.
 *   - It takes the `req` (request) and `res` (response) objects, inspects them, and either
 *     blocks the request (e.g., `res.status(403)`) or allows it to proceed by calling `next()`.
 * ============================================================================
 */


/**
 * Custom CSRF protection middleware.
 * Verifies a token sent in headers for state-changing requests.
 */

/*
 * ===== FUNCTION: csrfProtection =====
 * WHAT: Protects against Cross-Site Request Forgery (CSRF). 
 * WHY: If a user is logged into Veritas, a malicious website could open an invisible 
 *   frame and make a POST request to `/university/certificate/issue`. Because the user
 *   is logged in, their session cookie is sent automatically. 
 * PREVENTION: We generate a random Token that the malicious site doesn't know. Every 
 *   POST request must include this token.
 */
function csrfProtection(req, res, next) {
    // Methods that require CSRF protection (i.e. methods that mutate/change data)
    const protectedMethods = ['POST', 'PUT', 'DELETE', 'PATCH'];

    // If it's just a GET request (viewing a page), it's safe. Let it pass.
    if (!protectedMethods.includes(req.method)) {
        return next();
    }

    // Exempt specific routes if needed (e.g., external webhooks)
    // We don't protect `/api/verify` because external employers aren't part of the session
    const exemptRoutes = ['/api/verify']; // Example
    if (exemptRoutes.some(route => req.path.startsWith(route))) {
        return next();
    }

    // Check where the token came from. It can be sent in a custom header, or inside a form body
    const tokenFromHeader = req.get('X-XSRF-Token');
    const tokenFromBody = req.body._csrf;
    const tokenFromSession = req.session.csrfToken;

    // If the token is missing from the session entirely, 
    // or if the provided token doesn't match the one we stored, BLOCK THE REQUEST.
    if (!tokenFromSession || (tokenFromHeader !== tokenFromSession && tokenFromBody !== tokenFromSession)) {
        logger.warn(`Potential CSRF attack detected. Path: ${req.path}, IP: ${req.ip}`);
        return res.status(403).json({
            error: "Forbidden",
            message: "Missing or invalid CSRF token. Please refresh the page and try again."
        });
    }

    // If everything matches, proceed to the main controller route!
    next();
}

/**
 * Middleware to generate a CSRF token and attach it to the session and locals.
 */

/*
 * ===== FUNCTION: generateCsrfToken =====
 * WHAT: Creates the secret token used by `csrfProtection` above.
 * WHY: This runs on every GET request so that when we render HTML forms, 
 *   we can inject the secret token into a hidden input field.
 */
function generateCsrfToken(req, res, next) {
    // If the user doesn't have a token yet, create a 32-byte random hex string
    if (!req.session.csrfToken) {
        req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    }
    // WHAT: Commit the session to the database
    // WHY: In Vercel (serverless), we need to ensure the session is saved 
    //   BEFORE the request completes, otherwise the token may be lost.
    req.session.save();

    // Makes the token available to the EJS template engine
    res.locals.csrfToken = req.session.csrfToken;
    next();
}

/**
 * Middleware to bind the session to the client's User-Agent.
 * Prevents basic session hijacking where a cookie is used from a different browser.
 */

/*
 * ===== FUNCTION: bindSessionToClient =====
 * WHAT: Attaches the user's browser type (User-Agent) to their session cookie.
 * WHY SECURITY: If a hacker steals a user's session cookie file from their computer,
 *   but the hacker is using Firefox and the victim was using Chrome, the server 
 *   will notice the User-Agent changed mid-session and instantly log them out.
 */
function bindSessionToClient(req, res, next) {
    const userAgent = req.get('User-Agent');

    // Store the browser type on their first visit
    if (!req.session.userAgent) {
        req.session.userAgent = userAgent;
    } else if (req.session.userAgent !== userAgent) {
        // Attack detected: The session cookie changed browsers!
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

/*
 * ===== FUNCTION: generateNonce =====
 * WHAT: Generates a random number that is used for Content Security Policy.
 * WHY: When injecting custom scripts into HTML, modern browsers block them unless 
 *   they have this specific signed "nonce". Prevents general script injections.
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
