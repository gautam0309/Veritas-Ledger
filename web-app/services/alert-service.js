const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const AuditLog = require('../database/models/auditlog');

/**
 * Alert Service (SAMM Operations L3)
 * Monitors AuditLog and app.log for security anomalies.
 */
class AlertService {
    constructor() {
        this.logFilePath = path.join(__dirname, '../app.log');
        this.failedLoginThreshold = 10; // Per hour per user/IP
        this.unauthorizedAccessThreshold = 5;
    }

    /**
     * Start the monitoring interval
     */
    start() {
        logger.info("Alert Service started. Monitoring for security anomalies...");
        // Check every 5 minutes
        setInterval(() => this.scanAnomalies(), 5 * 60 * 1000);
    }

    /**
     * Scan AuditLog and app.log for suspicious patterns
     */
    async scanAnomalies() {
        try {
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

            // 1. Detect Brute Force (Login failures)
            // Note: Currently we only log successful logins in AuditLog. 
            // We should ideally log failures too. Scanning app.log for "Too many login attempts"
            this.scanLogFileForBruteForce();

            // 2. Detect Unauthorized ABAC Attempts
            const unauthorizedAttempts = await AuditLog.countDocuments({
                details: { $regex: /unauthorized|forbidden|access denied/i },
                timestamp: { $gt: oneHourAgo }
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

    scanLogFileForBruteForce() {
        if (!fs.existsSync(this.logFilePath)) return;

        const content = fs.readFileSync(this.logFilePath, 'utf8');
        const lines = content.split('\n');
        const recentAttacks = lines.filter(line => line.includes('Too many login attempts') || line.includes('429'));

        if (recentAttacks.length > 20) {
            this.triggerAlert('DOS_ATTACK_DETECTED', {
                count: recentAttacks.length,
                message: "High volume of rate-limit triggers detected in app.log. Potential DoS in progress."
            });
        }
    }

    triggerAlert(type, payload) {
        // In a real Level 3 system, this would send an SMS, Email, or Webhook (PagerDuty/Slack)
        logger.warn(`[SECURITY_ALERT] Type: ${type} - ${payload.message}`);
        // Log to a dedicated security-alerts.log
        fs.appendFileSync(path.join(__dirname, '../security-alerts.log'),
            `\n[${new Date().toISOString()}] ALERT: ${type} - ${JSON.stringify(payload)}`);
    }
}

module.exports = new AlertService();
