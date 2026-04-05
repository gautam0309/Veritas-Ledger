/*
 * ============================================================================
 * FILE: web-app/services/alert-service.js
 * ============================================================================
 * 
 * PURPOSE:
 *   An automated background security monitor (SAMM Operations L3).
 *   Reads through application files and MongoDB logs to detect suspicious
 *   activities like brute force password guessing or unauthorized blockchain access.
 *
 * HOW IT WORKS:
 *   - Runs in the background (via setInterval) every 5 minutes.
 *   - Specifically looks for high frequencies of failures (e.g., 20+ rate limit
 *     hits or 5+ unauthorized ledger accesses).
 *   - When triggered, logs a critical [SECURITY_ALERT] and writes to a dedicated ledger.
 * ============================================================================
 */


const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const AuditLog = require('../database/models/auditlog');

/**
 * Alert Service (SAMM Operations L3)
 * Monitors AuditLog and app.log for security anomalies.
 */

/*
 * ===== CLASS: AlertService =====
 * WHAT: Object-Oriented class to encapsulate all alert functionalities.
 */
class AlertService {
    constructor() {
        // WHAT: Path to the main application log file (where Morgan and Winston output)
        this.logFilePath = path.join(__dirname, '../app.log');
        // Setting thresholds: How many strikes before we trigger an alarm?
        this.failedLoginThreshold = 10; // Per hour per user/IP
        this.unauthorizedAccessThreshold = 5;
    }

    /**
     * Start the monitoring interval
     */

    /*
     * ===== METHOD: start =====
     * WHAT: Bootstraps the continuous scanning loop. Called when the server starts.
     */
    start() {
        logger.info("Alert Service started. Monitoring for security anomalies...");
        // Check every 5 minutes (5 * 60 seconds * 1000 milliseconds)
        setInterval(() => this.scanAnomalies(), 5 * 60 * 1000);
    }

    /**
     * Scan AuditLog and app.log for suspicious patterns
     */

    /*
     * ===== METHOD: scanAnomalies =====
     * WHAT: Central function to define the rules for triggering alerts.
     */
    async scanAnomalies() {
        try {
            // Establish the time window (we only care about the last 60 minutes)
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

            // 1. Detect Brute Force (Login failures)
            // Note: Currently we only log successful logins in AuditLog. 
            // We should ideally log failures too. Scanning app.log for "Too many login attempts"
            // WHAT: Analyzes the raw disk log file for Express Rate Limit violations.
            this.scanLogFileForBruteForce();

            // 2. Detect Unauthorized ABAC Attempts
            // WHAT: Queries MongoDB to see if the ledger threw "Access Denied" errors repeatedly.
            // WHY: If someone keeps hitting the blockchain with the wrong keys, it's a threat.
            const unauthorizedAttempts = await AuditLog.countDocuments({
                details: { $regex: /unauthorized|forbidden|access denied/i }, // Regex case-insensitive search
                timestamp: { $gt: oneHourAgo } // $gt means "Greater Than" (newer than oneHourAgo)
            });

            if (unauthorizedAttempts >= this.unauthorizedAccessThreshold) {
                this.triggerAlert('CRITICAL_AUTHORIZATION_FAILURE', {
                    count: unauthorizedAttempts,
                    message: "High frequency of authorization failures detected on the blockchain gateway."
                });
            }

        } catch (err) {
            logger.error("Alert Service Failure: " + err.message);
        }
    }

    /*
     * ===== METHOD: scanLogFileForBruteForce =====
     * WHAT: Reads physical server logs looking for HTTP 429 requests (Too Many Requests).
     */
    scanLogFileForBruteForce() {
        if (!fs.existsSync(this.logFilePath)) return;

        // Read the entire file into memory as a string
        const content = fs.readFileSync(this.logFilePath, 'utf8');
        // Split it into an array of individual lines
        const lines = content.split('\n');
        // Filter out any lines that don't contain the specific error phrases
        const recentAttacks = lines.filter(line => line.includes('Too many login attempts') || line.includes('429'));

        // If there are more than 20 violations in the file, sound the alarm!
        if (recentAttacks.length > 20) {
            this.triggerAlert('DOS_ATTACK_DETECTED', {
                count: recentAttacks.length,
                message: "High volume of rate-limit triggers detected in app.log. Potential DoS in progress."
            });
        }
    }

    /*
     * ===== METHOD: triggerAlert =====
     * WHAT: The action taken when a threat is identified.
     */
    triggerAlert(type, payload) {
        // In a real Level 3 system, this would send an SMS, Email, or Webhook (PagerDuty/Slack)
        
        // Push a yellow warning to the terminal console
        logger.warn(`[SECURITY_ALERT] Type: ${type} - ${payload.message}`);
        
        // Log to a dedicated security-alerts.log file for historical auditing
        // WHY: In many serverless environments (like Vercel), the filesystem is read-only.
        //   We wrap this in a try-catch to prevent a crash if writing fails.
        try {
            fs.appendFileSync(path.join(__dirname, '../security-alerts.log'),
                `\n[${new Date().toISOString()}] ALERT: ${type} - ${JSON.stringify(payload)}`);
        } catch (err) {
            logger.warn(`Could not write to security-alerts.log: ${err.message}`);
        }
    }
}

// Export a single instance of the class (Singleton pattern)
module.exports = new AlertService();
