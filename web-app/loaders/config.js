/*
 * ============================================================================
 * FILE: web-app/loaders/config.js
 * ============================================================================
 * 
 * PURPOSE:
 *   Centralizes ALL configuration values into one exported object.
 *   Instead of accessing process.env.SOME_VAR everywhere in the code,
 *   you import this file and use config.someVar. This is cleaner and
 *   makes it easy to see all config values in one place.
 *
 * HOW IT CONNECTS:
 *   - Read by nearly EVERY file in the app (app.js, mongoose.js, chaincode.js, etc.)
 *   - Values come from the .env file (loaded by dotenv in package.json start script)
 *   - Must be loaded FIRST before any other module that needs config
 *
 * WHEN EXECUTED: At app startup, imported by app.js as the very first module.
 * ============================================================================
 */

//add configuration files
//initialize environment variables
//try to use the export from this file instead of touching process.env directly.


// CONCEPT — process.env:
//   `process` is a global Node.js object representing the running process.
//   `process.env` is an object containing all environment variables.
//   Environment variables are set in the .env file or by the OS.
//   Example: process.env.PORT might be "4000", process.env.MONGODB_URI might be "mongodb://localhost/educert"
// CONCEPT — || (Logical OR as default):
//   `process.env.NODE_ENV || 'development'` means: use the env var if set, otherwise default to 'development'.
// WHAT: Determines if we're running in development or production mode.
// IF REMOVED: `env` would be undefined, and the development check below would fail.
const env = process.env.NODE_ENV || 'development';

// WHAT: Determine the MongoDB connection string.
// WHY: In production (Vercel/Heroku), we use a cloud URI like MongoDB Atlas.
//   We check for both MONGODB_URI and MONGO_URI (common in Vercel settings).
//   In development, we default to localhost if no remote URI is specified.
if (!process.env.MONGODB_URI && !process.env.MONGO_URI && env === 'development') {
    process.env.MONGODB_URI = process.env.MONGODB_URI_LOCAL || "mongodb://localhost:27017/educert";
}
const mongodbURI = process.env.MONGODB_URI || process.env.MONGO_URI;


// WHAT: Exports a configuration object that other files import.
// WHY: Single source of truth for all config values.
//   Usage: `const config = require('./loaders/config'); console.log(config.port);`
// CONCEPT — Object literal export:
//   We export a plain object { key: value, key: value, ... }.
//   Each key maps a friendly name to an environment variable.
module.exports = {
    // MongoDB connection string (URI = Uniform Resource Identifier)
    // Example: "mongodb://localhost:27017/educert"
    mongodbURI: mongodbURI,

    // Port the web server listens on (e.g., 4000)
    port: process.env.PORT,

    // Winston logging level: "info", "debug", "warn", "error"
    // Defaults to "info" if not set in .env
    logLevel: process.env.LOG_LEVEL || "info",

    // Secret key for signing express-session cookies
    // MUST be a long random string in production for security
    expressSessionSecret: process.env.EXPRESS_SESSION_SECRET,


    // Hyperledger Fabric configuration — everything the SDK needs to connect
    fabric: {
        // Path to the Connection Profile (CCP) JSON file
        // The CCP tells the SDK where to find peers, orderers, and CAs
        ccpPath: process.env.CCP_PATH,

        // Absolute path to the wallet directory where Fabric identities are stored
        // CONCEPT — require('path').resolve():
        //   Constructs an absolute path by joining segments.
        //   __dirname = the directory of THIS file (web-app/loaders/)
        //   ".." = go up one level (to web-app/)
        //   "wallet" = the wallet folder
        //   Result: /absolute/path/to/web-app/wallet
        // WHY: The Fabric SDK needs an absolute path, not a relative one.
        walletPath: require('path').resolve(__dirname, "..", "wallet"),

        // Fabric channel name (e.g., "mychannel")
        channelName : process.env.FABRIC_CHANNEL_NAME,

        // Chaincode name (e.g., "educert")
        chaincodeName : process.env.FABRIC_CHAINCODE_NAME,

        // REMOTE TUNNEL SUPPORT (Ngrok)
        // If these are set in Vercel, the app will use them instead of localhost
        peerEndpoint: process.env.FABRIC_PEER_ENDPOINT,
        caEndpoint: process.env.FABRIC_CA_ENDPOINT
    }
};
