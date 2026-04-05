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


// WHAT: Tell Mongoose to use the global Node.js Promise library
// WHY: In older versions of Mongoose, its internal promise library was deprecated.
//   This explicitly maps mongoose promises to standard standard JavaScript Promises.
//   (e.g., so `User.findOne().then(...)` works as expected).
mongoose.Promise = global.Promise;

// WHAT: Establish the actual connection to the MongoDB server
// HOW: mongoose.connect(URI, options)
// CONCEPT — Connection Options:
//   - useNewUrlParser: Use the new MongoDB connection string parser (fixes deprecation warnings)
//   - useCreateIndex: Ensures .createIndexes() works correctly for unique fields (like email)
//   - useUnifiedTopology: Use the new Server Discover and Monitoring engine (modern connection management)
//   - autoIndex: False means "don't build indexes automatically when schemas load".
//       WHY false? Building indexes in production can freeze the database. Best practice
//       is to create them manually, though we call .createIndexes() explicitly in our models.
mongoose.connect( config.mongodbURI, {
    useNewUrlParser: true,
    useCreateIndex: true,
    useUnifiedTopology: true,
    autoIndex: false
})
// WHAT: .then() executes if the connection succeeds
.then(() => logger.info("You are connected to the database"))
// WHAT: .catch() executes if the connection fails (e.g., MongoDB not running)
.catch((err) => {
    logger.error(err)
});

// WHAT: Export the connected mongoose instance
// WHY: So models can use this exact connection to define schemas and queries.
// IF REMOVED: Models would fail to compile, and the app couldn't write/read to MongoDB.
module.exports = mongoose;
