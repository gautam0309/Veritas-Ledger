const nodemailer = require('nodemailer');
const logger = require('./logger');

// Email transporter configuration
// Uses environment variables for SMTP settings
// If not configured, emails will be logged but not sent
let transporter = null;

function initializeTransporter() {
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
        transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: process.env.SMTP_PORT || 587,
            secure: process.env.SMTP_SECURE === 'true',
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
async function sendEmail(to, subject, html) {
    try {
        if (transporter) {
            await transporter.sendMail({
                from: process.env.SMTP_FROM || '"Veritas Ledger" <noreply@veritas-ledger.com>',
                to,
                subject,
                html
            });
            logger.info(`Email sent to ${to}: ${subject}`);
        } else {
            logger.info(`[EMAIL LOG] To: ${to} | Subject: ${subject}`);
        }
    } catch (err) {
        logger.error(`Failed to send email to ${to}: ${err.message}`);
    }
}

/**
 * Send certificate issued notification to student
 */
async function notifyCertificateIssued(studentEmail, studentName, universityName, major) {
    const subject = `New Certificate Issued - ${universityName}`;
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

module.exports = {
    sendEmail,
    notifyCertificateIssued,
    notifyCertificateRevoked,
    notifyRegistration,
    notifyTranscriptRequest
};
