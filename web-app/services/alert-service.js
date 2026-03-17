const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const AuditLog = require('../database/models/auditlog');


class AlertService {
    constructor() {
        this.logFilePath = path.join(__dirname, '../app.log');
        this.failedLoginThreshold = 10; 
        this.unauthorizedAccessThreshold = 5;
    }

    
    start() {
        logger.info("Alert Service started. Monitoring for security anomalies...");
        
        setInterval(() => this.scanAnomalies(), 5 * 60 * 1000);
    }

    
    async scanAnomalies() {
        try {
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

            
            
            
            this.scanLogFileForBruteForce();

            
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
        
        logger.warn(`[SECURITY_ALERT] Type: ${type} - ${payload.message}`);
        
        fs.appendFileSync(path.join(__dirname, '../security-alerts.log'),
            `\n[${new Date().toISOString()}] ALERT: ${type} - ${JSON.stringify(payload)}`);
    }
}

module.exports = new AlertService();
