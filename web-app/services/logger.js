/*
 * ============================================================================
 * FILE: web-app/services/logger.js
 * ============================================================================
 * 
 * PURPOSE:
 *   Standardizes console and file logging across the entire application using Winston.
 *   Replaces standard `console.log()` to provide log levels (info, debug, error)
 *   and structured formatting.
 *
 * HOW IT CONNECTS:
 *   - Imported in almost every file (`const logger = require('./logger')`)
 *   - Also hooked into Morgan (HTTP request logger) via `logger.stream`
 * ============================================================================
 */


const winston = require('winston');
const {transports, format} = winston;

// WHAT: 'split' is a simple Node.js stream utility
// WHY: Used to break incoming stream data (like HTTP logs from Morgan) down line-by-line
const split = require('split');

const config = require('../loaders/config');


// WHAT: Define the text format for the logs
// Output example: "info: Server started on port 4000"
const print = format.printf((info) => {
    const log = `${info.level}: ${info.message}`;

    // If there's an error stack trace attached, print it on the next line
    return info.stack
        ? `${log}\n${info.stack}`
        : log;
});

// Load the log level from config.js (e.g., 'debug' prints everything, 'error' prints only errors)
let logLevelConsole = config.logLevel;

// WHAT: Create the actual Winston logger instance
const logger = winston.createLogger({
    level: logLevelConsole,
    format: format.combine(
        format.errors({stack: true}), // Enable capturing full error stack traces
        print, // Apply our custom print format defined above
    ),
    // Define where the logs go. Here, just to the standard console stdout.
    transports: [new transports.Console()],
});

// WHAT: Create a stream interface specifically for Morgan (in app.js)
// WHY: Morgan captures HTTP requests (e.g., GET /login 200). We route Morgan's
//   output through Winston so all logs look the same and obey the same log levels.
logger.stream = split().on('data', function (line) {
    logger.info(line)
});



// testing format of error. Check this before fucking around with the morgan loaders :'3
// const error = new Error('Testing Error');
// logger.error(error);
// logger.error('An error occurred:', error);

module.exports = logger;