/*
 * ============================================================================
 * FILE: web-app/database/mongoose.js
 * ============================================================================
 * 
 * PURPOSE:
 *   Initializes the MongoDB connection using the Mongoose ODM (Object-Document Mapper).
 *   Exports the connected mongoose instance for use by all database models.
 *
 * HOW IT CONNECTS:
 *   - Imported by app.js during server startup (require('./database/mongoose'))
 *   - Imported by model files (students.js, universities.js, etc.) to define schemas
 *   - Uses the MongoDB URI defined in loaders/config.js
 *
 * CONCEPT — Mongoose ODM:
 *   MongoDB is a NoSQL database (stores JSON-like documents without strict schemas).
 *   Mongoose adds structure at the application layer: schemas, validation, and
 *   helper methods (like .find() or .save()). This file establishes the core connection.
 * ============================================================================
 */

// WHAT: Import the Mongoose library
let mongoose = require('mongoose');

// WHAT: Import our custom Winston logger for standardized log output
const logger = require('../services/logger');

// WHAT: Import application configuration (contains the MongoDB URI)
const config = require('../loaders/config');

//loader class for mongoDB.
//initializes mongodb and exports connection.


// WHAT: Configure global Mongoose settings for Serverless (Vercel)
// 1. Disable command buffering: Fail immediately if not connected instead of waiting 10s.
// 2. Disable auto-indexing: Prevent slow index builds on every function invocation.
mongoose.set('bufferCommands', false);

// WHAT: Establish the actual connection to the MongoDB server
// HOW: mongoose.connect(URI, options)
// GUARD: Ensure the URI exists to prevent "openUri() must be a string" crash
if (!config.mongodbURI) {
    logger.error("MONGODB_URI or MONGO_URI is not defined in environment variables. Database connection skipped.");
} else {
    // 🔍 DEBUG: Log a redacted URI to help diagnose connection strings in Vercel
    // It hides the password but shows the username and host structure.
    const redactedURI = config.mongodbURI.replace(/:([^:@]+)@/, ':****@');
    logger.info(`Mongoose: Attempting connection to ${redactedURI}`);

    mongoose.connect( config.mongodbURI, {
        useNewUrlParser: true,
        useCreateIndex: true,
        useUnifiedTopology: true,
        autoIndex: false,
        connectTimeoutMS: 10000,
        socketTimeoutMS: 45000,
        serverSelectionTimeoutMS: 5000, // IMPORTANT for Vercel: Fail fast if DNS/Network is blocked
        heartbeatFrequencyMS: 10000     // Keep the connection warm
    })
    .then(() => logger.info("Successfully connected to MongoDB Atlas"))
    .catch((err) => {
        logger.error(`CRITICAL: MongoDB Connection Failed. Structure: ${redactedURI} | Error: ${err.message}`);
    });
}

// WHAT: Monitor connection events for better cloud debugging
mongoose.connection.on('connected', () => logger.info('Mongoose: Connection established'));
mongoose.connection.on('error', (err) => logger.error(`Mongoose: Connection error: ${err.message}`));
mongoose.connection.on('disconnected', () => logger.warn('Mongoose: Connection lost'));
mongoose.connection.on('reconnected', () => logger.info('Mongoose: Connection restored'));

// WHAT: Export the connected mongoose instance
// WHY: So models can use this exact connection to define schemas and queries.
// IF REMOVED: Models would fail to compile, and the app couldn't write/read to MongoDB.
module.exports = mongoose;
