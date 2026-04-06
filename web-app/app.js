require('./loaders/crypto-patch');
/*
 * ============================================================================
 * FILE: web-app/app.js
 * ============================================================================
 * 
 * PURPOSE:
 *   This is the EXPRESS APPLICATION — the central hub that wires together
 *   ALL middleware, routes, security, and error handling. Every HTTP request
 *   flows through this file's middleware pipeline before reaching a route.
 *
 * HOW IT CONNECTS:
 *   - bin/www imports this file and creates an HTTP server with it
 *   - Requires all loaders (config, database, Fabric)
 *   - Mounts all middleware (session, security, rate limiting, CORS, helmet)
 *   - Mounts all route handlers (index, API, university, student, verify)
 *
 * MIDDLEWARE EXECUTION ORDER (top to bottom):
 *   Request → CORS → Rate Limiter → Morgan Logger → JSON Parser →
 *   URL Parser → Mongo Sanitize → Cookie Parser → Static Files →
 *   Session → Security (CSRF, Nonce) → Helmet → CSP → Routes → Error Handler
 * ============================================================================
 */

// ════════════════════════════════════════════════════
// SECTION 1: Initialize configuration and subsystems
// ════════════════════════════════════════════════════

//initialize env variables, database and loaders.
// WHAT: Load config.js FIRST — all other modules depend on configuration values
// WHY: Config reads .env file and provides process.env values to the entire app
// ORDER MATTERS: This must be the FIRST import so env vars are available to everything else
const config = require('./loaders/config');

//load database
// WHAT: Connect to MongoDB by importing the mongoose setup module
// WHY: Must happen before session middleware (sessions are stored in MongoDB)
// SIDE EFFECT: Just importing this file triggers mongoose.connect()
const mongoose = require('./database/mongoose');

//load fabric environemtn
// WHAT: Bootstrap Fabric admin identity by importing the fabric loader
// WHY: Ensures the admin wallet identity exists for all Fabric operations
// SIDE EFFECT: Just importing this file triggers enrollment.enrollAdmin()
require('./loaders/fabric-loader');


// ════════════════════════════════════════════════════
// SECTION 2: Third-party library imports
// ════════════════════════════════════════════════════

//third party libraries
// WHAT: http-errors creates proper HTTP error objects (404, 500, etc.)
// WHY: Used at the bottom to create 404 errors for unmatched routes
let createError = require('http-errors');

// WHAT: Express is the web framework — handles routing, middleware, request/response
// CONCEPT — Express:
//   Express is a minimal web framework for Node.js. It provides:
//   - Routing (URL → handler function mapping)
//   - Middleware pipeline (functions that process requests in order)
//   - Request/Response helpers (req.body, res.json(), res.render())
//   Without Express, you'd have to manually parse HTTP requests.
let express = require('express');

// WHAT: Node.js built-in path module for working with file/directory paths
// WHY: Used to construct absolute paths for views and static file directories
let path = require('path');

// WHAT: cookie-parser middleware — parses Cookie headers into req.cookies object
// WHY: Needed to read cookies from incoming requests (used by session middleware)
let cookieParser = require('cookie-parser');

// WHAT: morgan is an HTTP request logger — logs every incoming request
// WHY: Debugging and monitoring — see which URLs are being hit and response times
let morgan = require('morgan');

// WHAT: helmet is a security middleware — sets various HTTP security headers
// CONCEPT — Security Headers:
//   HTTP headers like X-Frame-Options, X-XSS-Protection, Strict-Transport-Security
//   tell browsers to enable security features. Helmet sets these automatically.
const helmet = require('helmet');

// WHAT: cors (Cross-Origin Resource Sharing) — controls which domains can access the API
// CONCEPT — CORS:
//   By default, browsers block requests from one domain to another (same-origin policy).
//   CORS headers tell the browser "it's OK for domain X to access my API."
const cors = require('cors');

// ════════════════════════════════════════════════════
// SECTION 3: Local module imports
// ════════════════════════════════════════════════════

//local imports
// WHAT: Rate limiter middleware — limits how many requests a client can make per time window
// WHY: Prevents abuse (DDoS attacks, brute-force login attempts)
let limiter = require('./middleware/rate-limiter-middleware');

// WHAT: Custom Winston logger service
const logger = require('./services/logger');

// WHAT: Express session middleware (configured in express-session-loader.js)
const sessionMiddleware = require('./loaders/express-session-loader');

// WHAT: Custom security middleware (session binding, CSRF tokens, nonces)
const securityMiddleware = require('./middleware/security-middleware');

// WHAT: Alert service for security monitoring (SAMM Operations L3 compliance)
const alertService = require('./services/alert-service');

// Start Security Alert Service (SAMM Operations L3)
// WHAT: Starts a periodic check for security alerts (suspicious activity)
// WHY: Part of the security audit compliance — monitors for anomalies
alertService.start();

// ════════════════════════════════════════════════════
// SECTION 4: Route imports
// ════════════════════════════════════════════════════

//Router imports
// WHAT: Each router handles a group of related URL paths
// WHY: Separation of concerns — each route file handles one "section" of the app
let indexRouter = require('./routes/index-router');     // / (home, login, register pages)
let apiRouter = require('./routes/api-router');         // /api/* (REST API endpoints)
let universityRouter = require('./routes/university-router'); // /university/* (university dashboard)
let studentRouter = require('./routes/student-router'); // /student/* (student dashboard)
let verifyRouter = require('./routes/verify-router');   // /verify/* (certificate verification)

// ════════════════════════════════════════════════════
// SECTION 5: Create Express app and configure view engine
// ════════════════════════════════════════════════════

//express
// WHAT: Create the Express application instance
// WHY: This `app` object is the core — all middleware and routes are attached to it
// CONCEPT — express():
//   express() is a function that returns an Express application.
//   The app has methods like .use(), .get(), .post(), .set(), .listen()
let app = express();

// WHAT: Trust the Vercel/Reverse Proxy
// WHY: Vercel uses a proxy. Without this, secure cookies (HTTPS) will not 
//   be sent correctly to the browser. This fixes the CSRF "Forbidden" error.
app.set('trust proxy', 1);

// view engine setup
// WHAT: Tell Express where to find HTML template files
// WHY: When res.render('dashboard-student') is called, Express looks in this directory
// CONCEPT — app.set(key, value):
//   Sets application-level settings. 'views' tells Express the template directory.
app.set('views', path.join(__dirname, 'views'));
// WHAT: Tell Express to use EJS as the template engine
// CONCEPT — EJS (Embedded JavaScript):
//   EJS templates are HTML files with embedded JavaScript: <% code %> and <%= output %>
//   The server processes these templates, injects data, and sends the resulting HTML to the browser.
app.set('view engine', 'ejs');

// ════════════════════════════════════════════════════
// SECTION 6: Middleware pipeline (ORDER MATTERS!)
// ════════════════════════════════════════════════════

//middleware
// CONCEPT — app.use(middleware):
//   Adds a function to the middleware pipeline. Every request passes through
//   ALL app.use() functions IN ORDER (top to bottom) before reaching a route.
//   Each middleware can: modify req/res, end the response, or call next() to continue.

// WHAT: Enable CORS — allow cross-origin requests from specified domains
// WHY: If the frontend is on a different domain/port, browsers block requests without CORS
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : true,
  credentials: true  // Allow cookies to be sent with cross-origin requests
}));

// WHAT: Apply rate limiting to all requests
// WHY: Prevents a single client from overwhelming the server with too many requests
app.use(limiter.rateLimiterMiddlewareInMemory);

// WHAT: Log every HTTP request (method, URL, status, response time)
// WHY: Creates access logs for debugging and monitoring
// 'tiny' format: "GET /university/dashboard 200 - 15.432 ms"
// { stream: logger.stream } pipes output to our Winston logger instead of console
app.use(morgan('tiny', { stream: logger.stream }));

// WHAT: Parse JSON request bodies (Content-Type: application/json)
// WHY: Without this, req.body would be undefined for JSON POST requests
// CONCEPT — express.json():
//   When a client sends JSON data (like { "email": "test@test.com" }),
//   this middleware parses it and makes it available as req.body.email
app.use(express.json());

// WHAT: Parse URL-encoded request bodies (Content-Type: application/x-www-form-urlencoded)
// WHY: HTML forms submit data in URL-encoded format. This parses it into req.body.
// { extended: true } allows nested objects (using the 'qs' library instead of 'querystring')
app.use(express.urlencoded({ extended: true }));

// WHAT: Sanitize user input to prevent MongoDB injection attacks
// CONCEPT — NoSQL Injection:
//   Attackers can send { "$gt": "" } instead of a password to bypass authentication.
//   mongoSanitize() strips any keys starting with $ or containing . from user input.
// WHY: Critical security middleware — prevents database manipulation
const mongoSanitize = require('express-mongo-sanitize');
app.use(mongoSanitize());

// WHAT: Parse Cookie headers and populate req.cookies
// WHY: Needed by session middleware to read the session cookie
app.use(cookieParser());

// WHAT: Serve static files (CSS, JS, images) from the 'public' directory
// WHY: When the browser requests /stylesheets/style.css, Express serves
//   the file from web-app/public/stylesheets/style.css
// CONCEPT — express.static():
//   Creates a middleware that serves files from a directory.
//   No route handler needed — Express automatically maps URLs to files.
app.use(express.static(path.join(__dirname, 'public')));

// WHAT: Enable session management (login persistence)
// WHY: After this middleware, every request has a req.session object
app.use(sessionMiddleware);

// WHAT: Bind the session to the client's IP and user-agent for security
// WHY: Prevents session hijacking — if someone steals a session cookie,
//   it won't work from a different IP or browser.
app.use(securityMiddleware.bindSessionToClient);

// WHAT: Generate a CSRF token and attach it to the response
// CONCEPT — CSRF (Cross-Site Request Forgery):
//   An attack where a malicious website tricks your browser into making
//   requests to our app (using your session cookie). CSRF tokens prevent this
//   by requiring a secret token that only our pages know.
app.use(securityMiddleware.generateCsrfToken);

// WHAT: Generate a unique nonce for Content Security Policy
// CONCEPT — Nonce:
//   A random value used once. Embedded in <script nonce="..."> tags.
//   The CSP policy below says "only run scripts with THIS nonce."
//   This prevents injected scripts from running (XSS protection).
app.use(securityMiddleware.generateNonce);

// WHAT: Apply Helmet security headers
// WHY: Sets X-Frame-Options, X-XSS-Protection, and other security headers
app.use(helmet());

// WHAT: Configure Content Security Policy (CSP) with dynamic nonce
// CONCEPT — CSP:
//   Tells the browser which sources are allowed to load scripts, styles, fonts, etc.
//   Without CSP, an attacker who injects HTML could load malicious scripts.
//   With CSP, the browser blocks any script not in the whitelist.
// WHY as separate middleware (not in helmet() above):
//   The nonce changes on every request, so we need access to res.locals.nonce
//   which is set by the generateNonce middleware that runs before this.
app.use((req, res, next) => {
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],              // Default: only allow resources from our own domain
      scriptSrc: ["'self'", `'nonce-${res.locals.nonce}'`, "https://code.jquery.com", "https://cdnjs.cloudflare.com", "https://stackpath.bootstrapcdn.com", "https://cdn.jsdelivr.net", "https://ajax.googleapis.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://stackpath.bootstrapcdn.com", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net"],
      fontSrc: ["'self'", "https:", "data:", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://cdn.jsdelivr.net", "https://stackpath.bootstrapcdn.com", "https://cdnjs.cloudflare.com", "https://code.jquery.com", "https://fonts.googleapis.com", "https://fonts.gstatic.com"],
    },
  })(req, res, next);
});

// ════════════════════════════════════════════════════
// SECTION 7: Route mounting
// ════════════════════════════════════════════════════

//routers
// WHAT: Mount route handlers at specific URL prefixes
// CONCEPT — app.use(prefix, router):
//   All URLs starting with `prefix` are handled by `router`.
//   Example: app.use('/university', universityRouter) means
//   a request to /university/dashboard is handled by universityRouter.
app.use('/', indexRouter);
app.use('/api', apiRouter);
app.use('/university', universityRouter);
app.use('/student', studentRouter);
app.use('/verify', verifyRouter);

// ════════════════════════════════════════════════════
// SECTION 8: Error handling (must be LAST in the pipeline)
// ════════════════════════════════════════════════════

// catch 404 and forward to error handler
// WHAT: If no route matched the request, create a 404 error
// WHY: Without this, unmatched requests would hang forever
// CONCEPT — next(error):
//   Calling next() with an error argument skips all remaining middleware
//   and jumps directly to the error handler below.
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler
// WHAT: Catches ALL errors (404s, 500s, thrown errors) and renders an error page
// WHY: Without a global error handler, uncaught errors would crash the server
// CONCEPT — Error-handling middleware:
//   Express recognizes a middleware with 4 parameters (err, req, res, next) as
//   an error handler. It receives errors from throw/next(error) calls.
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  // WHAT: Make error info available to the EJS template
  // WHY: In development, show full error details. In production, hide them
  //   to prevent leaking internal info to attackers.
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  // WHAT: Set the HTTP status code and render the error.ejs template
  // WHY: Sends a proper error page to the browser instead of raw text
  res.status(err.status || 500);
  res.render('error');
});


// WHAT: Export the configured Express app for bin/www to use
// WHY: bin/www does http.createServer(app) to create the HTTP server
module.exports = app;
