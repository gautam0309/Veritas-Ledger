/*
 * ============================================================================
 * FILE: web-app/services/email-service.js
 * ============================================================================
 * 
 * PURPOSE:
 *   Handles sending outbound HTML email notifications to users.
 *   Used for notifying students when certificates are issued or revoked,
 *   confirming account registrations, and notifying universities about
 *   transcript requests.
 *
 * HOW IT WORKS:
 *   - Uses the 'nodemailer' library.
 *   - Connects to an external SMTP server (like Gmail, Sendgrid, or Mailgun).
 *   - If no SMTP credentials are provided in the .env file, it fails gracefully
 *     and just prints the email payload to the server logs.
 * ============================================================================
 */

const nodemailer = require('nodemailer');
const logger = require('./logger');

// Email transporter configuration
// Uses environment variables for SMTP settings
// If not configured, emails will be logged but not sent
let transporter = null;

/*
 * ===== FUNCTION: initializeTransporter =====
 * WHAT: Boots up the nodemailer connection instance using credentials from .env.
 */
function initializeTransporter() {
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
        transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: process.env.SMTP_PORT || 587,
            secure: process.env.SMTP_SECURE === 'true', // true for 465, false for 587
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        });
        logger.info('Email transporter initialized');
    } else {
        logger.info('Email SMTP not configured - emails will be logged only');
    }
}

// Initialize on first require
initializeTransporter();

/**
 * Simple HTML escape function to prevent injection
 */

/*
 * ===== FUNCTION: escapeHTML =====
 * WHAT: Sanitizes user input before placing it inside an HTML email.
 * WHY SECURITY: Prevents Cross-Site Scripting (XSS) in email clients. If a malicious 
 *   user registers their name as `<script>stealCookie()</script>`, this function turns it 
 *   into harmless text `&lt;script&gt;stealCookie()&lt;/script&gt;` so the email app won't execute it.
 */
function escapeHTML(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/**
 * Send an email notification
 * @param {string} to - Recipient email
 * @param {string} subject - Email subject
 * @param {string} html - HTML body content
 */

/*
 * ===== FUNCTION: sendEmail =====
 * WHAT: The core utility wrapper around nodemailer's sendMail function.
 */
async function sendEmail(to, subject, html) {
    try {
        if (transporter) {
            // Send it over the network
            await transporter.sendMail({
                from: process.env.SMTP_FROM || '"Veritas Ledger" <noreply@veritas-ledger.com>',
                to,
                subject,
                html
            });
            logger.info(`Email sent to ${to}: ${subject}`);
        } else {
            // Development fallback: Print to console instead of sending
            logger.info(`[EMAIL LOG] To: ${to} | Subject: ${subject}`);
        }
    } catch (err) {
        // We don't throw the error, we catch it and log it.
        // WHY: We don't want the entire certificate issuance process to fail and crash
        //   just because an email bounced or the SMTP server was temporarily down.
        logger.error(`Failed to send email to ${to}: ${err.message}`);
    }
}

/**
 * Send certificate issued notification to student
 */
async function notifyCertificateIssued(studentEmail, studentName, universityName, major) {
    const subject = `New Certificate Issued - ${universityName}`;
    
    // Always escape dynamic data before interpolating into HTML
    const eStudentName = escapeHTML(studentName);
    const eUniversityName = escapeHTML(universityName);
    const eMajor = escapeHTML(major);

    const html = `
        <div style="font-family: 'Inter', sans-serif; max-width: 600px; margin: 0 auto; background: #1a1a2e; color: #fff; padding: 30px; border-radius: 10px;">
            <h2 style="color: #38f9d7;">Certificate Issued!</h2>
            <p>Dear <strong>${eStudentName}</strong>,</p>
            <p>A new certificate has been issued to you by <strong style="color: #667eea;">${eUniversityName}</strong>.</p>
            <p><strong>Major:</strong> ${eMajor}</p>
            <p>You can view and share your certificate from your <a href="http://localhost:4000/student/dashboard" style="color: #38f9d7;">Student Dashboard</a>.</p>
            <hr style="border-color: #333;">
            <p style="color: #999; font-size: 12px;">This certificate is verified on the Hyperledger Fabric blockchain and is tamper-proof.</p>
            <p style="color: #667eea; font-size: 12px;">— Veritas Ledger</p>
        </div>
    `;
    await sendEmail(studentEmail, subject, html);
}

/**
 * Send certificate revocation notification
 */
async function notifyCertificateRevoked(studentEmail, studentName, universityName, reason) {
    const subject = `Certificate Revoked - ${universityName}`;
    const eStudentName = escapeHTML(studentName);
    const eUniversityName = escapeHTML(universityName);
    const eReason = escapeHTML(reason);

    const html = `
        <div style="font-family: 'Inter', sans-serif; max-width: 600px; margin: 0 auto; background: #1a1a2e; color: #fff; padding: 30px; border-radius: 10px;">
            <h2 style="color: #f85149;">Certificate Revoked</h2>
            <p>Dear <strong>${eStudentName}</strong>,</p>
            <p>Your certificate from <strong>${eUniversityName}</strong> has been revoked.</p>
            <p><strong>Reason:</strong> ${eReason}</p>
            <p>If you believe this is an error, please contact your university directly.</p>
            <hr style="border-color: #333;">
            <p style="color: #667eea; font-size: 12px;">— Veritas Ledger</p>
        </div>
    `;
    await sendEmail(studentEmail, subject, html);
}

/**
 * Send registration confirmation
 */
async function notifyRegistration(email, name, role) {
    const subject = `Welcome to Veritas Ledger - Registration Successful`;
    const eName = escapeHTML(name);
    const eRole = escapeHTML(role);

    const html = `
        <div style="font-family: 'Inter', sans-serif; max-width: 600px; margin: 0 auto; background: #1a1a2e; color: #fff; padding: 30px; border-radius: 10px;">
            <h2 style="color: #38f9d7;">Welcome to Veritas Ledger!</h2>
            <p>Dear <strong>${eName}</strong>,</p>
            <p>Your ${eRole} account has been created successfully.</p>
            <p>You can now <a href="http://localhost:4000/${eRole}/login" style="color: #38f9d7;">log in</a> to access your dashboard.</p>
            <hr style="border-color: #333;">
            <p style="color: #667eea; font-size: 12px;">— Veritas Ledger</p>
        </div>
    `;
    await sendEmail(email, subject, html);
}

/**
 * Send transcript request notification
 */
async function notifyTranscriptRequest(universityEmail, studentName, certUUID, note) {
    const subject = `Transcript Request - ${studentName}`;
    const eStudentName = escapeHTML(studentName);
    const eCertUUID = escapeHTML(certUUID);
    const eNote = escapeHTML(note || 'No additional note provided.');

    const html = `
        <div style="font-family: 'Inter', sans-serif; max-width: 600px; margin: 0 auto; background: #1a1a2e; color: #fff; padding: 30px; border-radius: 10px;">
            <h2 style="color: #feca57;">Transcript Request</h2>
            <p><strong>Student:</strong> ${eStudentName}</p>
            <p><strong>Certificate UUID:</strong> ${eCertUUID}</p>
            <p><strong>Note:</strong> ${eNote}</p>
            <p>Please process this request according to your university's procedures.</p>
            <hr style="border-color: #333;">
            <p style="color: #667eea; font-size: 12px;">— Veritas Ledger System Notification</p>
        </div>
    `;
    await sendEmail(universityEmail, subject, html);
}

// Export the functions for controllers to use
module.exports = {
    sendEmail,
    notifyCertificateIssued,
    notifyCertificateRevoked,
    notifyRegistration,
    notifyTranscriptRequest
};
