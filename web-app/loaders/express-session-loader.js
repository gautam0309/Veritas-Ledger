/*
 * ============================================================================
 * FILE: web-app/loaders/express-session-loader.js
 * ============================================================================
 * 
 * PURPOSE:
 *   Configures and exports the Express session middleware.
 *   Sessions allow the server to "remember" who a user is across
 *   multiple HTTP requests (HTTP is stateless by default).
 *
 * HOW IT CONNECTS:
 *   - Imported by app.js → mounted as middleware with app.use(sessionMiddleware)
 *   - Sessions are stored in MongoDB (not in memory) via connect-mongo
 *   - The session ID is sent to the browser as a cookie named "session_id"
 *
 * CONCEPT — Session:
 *   When a user logs in, the server creates a "session" object in the database
 *   and gives the browser a cookie with the session ID. On every subsequent
 *   request, the browser sends this cookie back, and the server looks up
 *   the session to identify the user. It's like a VIP wristband at a club.
 * ============================================================================
 */

// WHAT: express-session is the core session management library for Express
// WHY: Provides req.session object on every request for storing user data
const expressSession = require('express-session');

// WHAT: connect-mongo is a session STORE adapter that saves sessions to MongoDB
// WHY: By default, express-session stores sessions in memory (RAM).
//   If the server restarts, all sessions are lost (all users get logged out).
//   connect-mongo persists sessions to MongoDB, so they survive restarts.
// IF REMOVED: Sessions would be lost every time the server restarts.
const connectMongo = require('connect-mongo');

// WHAT: Import our centralized config (MongoDB URI, session secret)
const config = require("./config");

// WHAT: Import the mongoose connection (needed by connect-mongo to access MongoDB)
// WHY: connect-mongo needs an active MongoDB connection to store session data
// IMPORTANT: This must be loaded AFTER mongoose connects to the database
const mongoose = require("../database/mongoose");

// WHAT: Create a MongoStore class from connect-mongo, linked to express-session
// CONCEPT — Factory Function Pattern:
//   connectMongo(expressSession) returns a class (MongoStore) that is
//   compatible with express-session's store interface.
//   This is a common pattern in Express middleware.
const mongoStore = connectMongo(expressSession);

// WHAT: Configuration object for express-session
// WHY: Defines how sessions behave — cookie settings, storage, security
let expessSessionConfig = {
    // WHAT: The cookie name sent to the browser (visible in DevTools → Application → Cookies)
    // WHY: Custom name instead of default "connect.sid" for slight security obscurity
    name: 'session_id', //This will need to be sent with all ajax cals to verify session/authenticate user.

    // WHAT: Secret key used to sign (encrypt) the session cookie
    // WHY: Prevents users from tampering with their session cookie value
    // CONCEPT — Cookie Signing:
    //   The server signs the cookie with this secret. If someone modifies
    //   the cookie, the signature won't match, and the server rejects it.
    // SECURITY: This MUST be a long, random string in production.
    secret: config.expressSessionSecret,

    // WHAT: Don't save the session back to the store if nothing changed
    // WHY: Reduces unnecessary MongoDB writes. Only save if session data was modified.
    resave: false,

    // WHAT: httpOnly is actually a cookie option (misplaced here, overridden below)
    httpOnly: true,

    // WHAT: Don't create a session for unauthenticated visitors
    // WHY: Prevents creating empty sessions for every page visit (saves storage)
    saveUninitialized: false,

    // WHAT: Cookie configuration — controls how the session cookie behaves in browsers
    cookie: {
        // WHAT: Cookie expires after 24 hours (86400000 milliseconds)
        // WHY: Forces users to re-login after a day for security
        maxAge: 86400000,
        // WHAT: Prevents JavaScript from reading the cookie (document.cookie won't see it)
        // WHY: Protects against XSS attacks — even if an attacker injects JS, they can't steal the cookie
        httpOnly: true, // Prevents client-side scripts from reading the cookie
        // WHAT: Cookie is only sent with same-site requests (not cross-site)
        // WHY: Mitigates CSRF (Cross-Site Request Forgery) attacks
        sameSite: 'lax', // Helps mitigate basic CSRF attacks
        // WHAT: In production, only send the cookie over HTTPS (encrypted connections)
        // WHY: Prevents cookie from being intercepted on unencrypted HTTP connections
        secure: process.env.NODE_ENV === 'production' // Only send cookie over HTTPS in production
    },

    // WHAT: Where to store session data — in MongoDB instead of RAM
    // WHY: Persistent storage — sessions survive server restarts
    // CONCEPT — new mongoStore({...}):
    //   Creates an instance of the MongoDB session store.
    //   mongooseConnection points it to our existing MongoDB connection.
    //   collection names the MongoDB collection where sessions are stored.
    store: new mongoStore({
        mongooseConnection: mongoose.connection,
        collection: "session"
    })
};

// WHAT: Create the actual session middleware function from the config
// WHY: Express middleware must be a function(req, res, next).
//   expressSession(config) returns such a function.
let sessionMiddleware = expressSession(expessSessionConfig);


// WHAT: Export the session middleware for use in app.js
// WHY: app.js does app.use(sessionMiddleware) to enable sessions on all routes
// IF REMOVED: No session management — users can't stay logged in
module.exports = sessionMiddleware;
//must come after mongoDB is loaded.