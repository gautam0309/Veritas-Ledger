/*
 * ============================================================================
 * FILE: web-app/middleware/rate-limiter-middleware.js
 * ============================================================================
 * 
 * PURPOSE:
 *   Protects the application from Denial of Service (DoS) attacks and 
 *   brute-force password guessing by limiting how frequently an IP address 
 *   can make requests.
 *
 * HOW IT WORKS:
 *   - Uses an in-memory bucket system.
 *   - General traffic is limited to 20 requests per second per IP.
 *   - Sensitive routes (like login pages) are strictly limited to 10 requests 
 *     every 15 minutes to prevent password cracking scripts.
 * ============================================================================
 */


const { RateLimiterMemory } = require('rate-limiter-flexible');
const logger = require('../services/logger');

// WHAT: Options for general API endpoint limits
const opts = {
    points: 20, // Each IP gets 20 "points"
    duration: 1, // Points refill every 1 second
};

// Create the memory instance for general endpoints
const rateLimiter = new RateLimiterMemory(opts);

/*
 * ===== FUNCTION: rateLimiterMiddlewareInMemory =====
 * WHAT: Attaches to the Express router. If an IP requests a page, deduct 1 point.
 *   If they have 0 points, reject the request with HTTP 429 (Too Many Requests).
 */
const rateLimiterMiddlewareInMemory = (req, res, next) => {
    rateLimiter.consume(req.ip)
        .then(() => {
            // Point successfully deducted. Allow request.
            next();
        })
        .catch((err) => {
            // Out of points! Block them.
            logger.error("ERROR: Too many request coming in from IP: " + req.ip);
            logger.error(err);
            return res.status(429).send('Too Many Requests');
        });
};


// WHAT: Strict options for sensitive endpoints (like /login)
const strictOpts = {
    points: 10,        // Only 10 points allowed...
    duration: 60 * 15, // ...every 15 minutes!
    blockDuration: 60 * 15, // If you exceed 10 points, ban the IP for a full 15 minutes.
};

const strictRateLimiter = new RateLimiterMemory(strictOpts);

/*
 * ===== FUNCTION: strictRateLimiterMiddleware =====
 * WHAT: Attached specifically to the POST /login and POST /register endpoints.
 * WHY: Hackers write bots that try 1,000 passwords a second (Brute force).
 *   By applying this middleware, the bot is completely disabled after 10 attempts.
 */
const strictRateLimiterMiddleware = (req, res, next) => {
    strictRateLimiter.consume(req.ip)
        .then(() => {
            next();
        })
        .catch((err) => {
            logger.error("Too many login attempts from IP: " + req.ip);
            // Send a user-friendly error message so legitimate users know they have to wait.
            return res.status(429).send('Too Many Login Attempts. Please try again after 15 minutes.');
        });
};


module.exports = { rateLimiterMiddlewareInMemory, strictRateLimiterMiddleware };
