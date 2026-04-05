let students = require('../database/models/students');
let fabricEnrollment = require('../services/fabric/enrollment');
let chaincode = require('../services/fabric/chaincode');
let logger = require("../services/logger");
let studentService = require('../services/student-service');
let AuditLog = require('../database/models/auditlog');
let certificates = require('../database/models/certificates');
let emailService = require('../services/email-service');
const pdfGenerator = require('../services/pdf-generator');
let identityHelper = require('../services/identity-helper');
const { validationResult } = require('express-validator');

/*
 * ============================================================================
 * FILE: web-app/controllers/student-controller.js
 * ============================================================================
 * 
 * PURPOSE:
 *   Handles all business logic for students: registering, logging in,
 *   viewing their dashboard of certificates, downloading PDFs, and tracking
 *   verification history.
 * ============================================================================
 */

let title = "Student Dashboard";
let root = "student";

/*
 * ===== FUNCTION: postRegisterStudent =====
 * WHAT: Registers a new student simultaneously in MongoDB and the Fabric CA.
 */
async function postRegisterStudent(req, res, next) {
    try {

        const { name, email, password, passwordConfirm } = req.body;

        // 1. Give the student a cryptographic identity on the local Blockchain Wallet container
        let keys = await fabricEnrollment.registerUser(req.body.email);

        // 2. Store their profile details in MongoDB 
        let dbResponse = await students.create({
            name: req.body.name,
            email: req.body.email,
            password: req.body.password,
            publicKey: keys.publicKey
        });

        // 3. Keep an unchangeable audit trail of this event
        await AuditLog.create({
            action: 'registration',
            performedBy: req.body.email,
            details: `Student "${req.body.name}" registered`,
            ipAddress: req.ip
        });

        // 4. Send a Welcome Email
        emailService.notifyRegistration(req.body.email, req.body.name, 'student');

        // 5. Render success UI to user
        res.render("register-success", {
            title, root,
            logInType: req.session.user_type || "none"
        });
    }
    catch (e) {
        logger.error(e);
        const errorString = e.message || e.toString();

        // MongoDB throws E11000 if a unique index (like Email) is violated.
        if (e.code === 11000 || errorString.includes('already exists') || errorString.includes('already registered')) {
            return res.render("register-student", {
                title, root,
                logInType: req.session.user_type || "none",
                registered: false,
                error: "Registration failed. Please check your details or try a different email."
            });
        }
        next(e);
    }
}

/*
 * ===== FUNCTION: logOutAndRedirect =====
 * WHAT: Destroys the Express session cookie.
 */
async function logOutAndRedirect(req, res, next) {
    req.session.destroy(function () {
        res.redirect('/');
    });
};

/*
 * ===== FUNCTION: postLoginStudent =====
 * WHAT: Authenticates a student, regenerates their session to prevent fixation 
 *   attacks, and ensures their cryptographic wallet is ready for blockchain actions.
 */
async function postLoginStudent(req, res, next) {
    try {
        // 1. Password hash comparison inside Mongoose
        let studentObject = await students.validateByCredentials(req.body.email, req.body.password)

        // 2. SECURITY PATTERN - Prevent Session Fixation 
        // We delete the old cookie and give them a totally new one upon login.
        await new Promise((resolve, reject) => {
            req.session.regenerate((err) => {
                if (err) reject(err);

                // Re-create the CSRF token for the new session 
                const crypto = require('crypto');
                req.session.csrfToken = crypto.randomBytes(32).toString('hex');
                res.locals.csrfToken = req.session.csrfToken;

                resolve();
            });
        });

        // 3. Hydrate session state needed later
        req.session.user_id = studentObject._id;
        req.session.user_type = "student";
        req.session.email = studentObject.email;
        req.session.name = studentObject.name;
        req.session.publicKey = studentObject.publicKey;

        // 4. Self-healing mechanism: If their internal crypto wallet was deleted 
        // (common in Docker restarts), we detect the missing `.id` file and recreate it 
        // using their `publicKey` stored in MongoDB.
        await identityHelper.ensureIdentity(studentObject.email);

        await AuditLog.create({
            action: 'login',
            performedBy: req.body.email,
            details: 'Student login',
            ipAddress: req.ip
        });

        return res.redirect("/student/dashboard")
    } catch (e) {
        logger.error(e);
        res.render('login-student', {
            title, root,
            logInType: req.session.user_type || "none",
            errorMessage: "Invalid email or password. Please try again."
        });
    }
}

/*
 * ===== FUNCTION: getDashboard =====
 * WHAT: Fetches certificates belonging to the student and loads the UI.
 */
async function getDashboard(req, res, next) {
    try {
        // Double check wallet health
        await identityHelper.ensureIdentity(req.session.email);

        // This service merges MongoDB visible data with Fabric chaincode cryptographic data
        let certData = await studentService.getCertificateDataforDashboard(req.session.publicKey, req.session.email);
        res.render("dashboard-student", {
            title, root, certData,
            logInType: req.session.user_type || "none"
        });

    } catch (e) {
        logger.error(e);
        next(e);
    }
}


/*
 * ===== FUNCTION: postRequestTranscript =====
 * WHAT: An added feature where students can ping their University asking for 
 *   physical transcripts via internal system emails.
 */
async function postRequestTranscript(req, res, next) {
    try {
        const { certId, note } = req.body;
        const studentName = req.session.name;

        // Find certificate to get university email
        const cert = await certificates.findById(certId);

        if (!cert) {
            throw new Error("Certificate not found");
        }

        // SECURITY (IDOR Fix): Ensure student owns the certificate they are requesting a transcript for.
        if (cert.studentEmail !== req.session.email) {
            throw new Error("Unauthorized: You do not own this certificate.");
        }

        // Uses Nodemailer to fire an email to the university staff
        await emailService.notifyTranscriptRequest(cert.universityEmail, studentName, certId, note);

        // Flash message handling via query param
        res.redirect('/student/dashboard?message=Transcript%20Requested');

    } catch (e) {
        logger.error(e);
        next(e);
    }
}

/*
 * ===== FUNCTION: getVerificationHistory =====
 * WHAT: Shows the student who has been verifying their certificates.
 * WHY: Gives users control over their data privacy by letting them see whenever
 *   an Employer or Background Agency checks their background.
 */
async function getVerificationHistory(req, res, next) {
    try {
        const studentEmail = req.session.email;

        // 1. Get all certificates for this student
        const studentCerts = await certificates.find({ studentEmail: studentEmail }).select('_id');
        // Convert MongoDB ObjectId to string to match the AuditLog schema `targetCertId`
        const certUUIDs = studentCerts.map(c => c._id.toString());
        
        // 2. Query Audit Log collection where the Action is a verification attempt 
        // AND the target was one of THIS student's certificates.
        const history = await AuditLog.find({
            action: { $in: ['certificate_verified', 'proof_verified'] },
            targetCertId: { $in: certUUIDs }
        }).sort({ timestamp: -1 }); // Sort by newest first

        // Render the UI view with the history arrays
        res.render('student-history', {
            title: "Verification History",
            root,
            logInType: req.session.user_type || "none",
            history
        });
    } catch (e) {
        logger.error(e);
        next(e);
    }
}

/*
 * ===== FUNCTION: downloadCertificatePDF =====
 * WHAT: Dynamically generates a PDF containing the student's degree data and 
 *   a QR code for verification, and streams it to the user's browser.
 */
async function downloadCertificatePDF(req, res, next) {
    try {
        let certId = req.params.certId;

        let cert = await certificates.findById(certId);
        if (!cert) {

            return res.status(404).send('Certificate not found');
        }

        // SECURITY (IDOR Fix): Only the owner can download it.
        const certEmail = cert.studentEmail ? cert.studentEmail.toLowerCase() : '';
        const sessionEmail = req.session.email ? req.session.email.toLowerCase() : '';

        if (certEmail !== sessionEmail) {
            return res.status(403).send('Unauthorized: You do not own this certificate.');
        }

        // PDFKit stream generation happens in this service block
        let pdfBuffer = await pdfGenerator.generateCertificatePDF({
            studentName: cert.studentName,
            major: cert.major,
            departmentName: cert.departmentName,
            universityName: cert.universityName,
            rollNumber: cert.rollNumber,
            cgpa: cert.cgpa,
            dateOfIssuing: cert.dateOfIssuing ? new Date(cert.dateOfIssuing).toISOString().split('T')[0] : 'N/A',
            certUUID: cert._id.toString()
        });

        // Set headers so the browser triggers a File Download instead of loading HTML
        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="certificate-${cert.rollNumber}.pdf"`,
            'Content-Length': pdfBuffer.length
        });
        res.send(pdfBuffer);

    } catch (e) {
        logger.error(e);
        if (!res.headersSent) {
            res.removeHeader('Content-Type');
            res.removeHeader('Content-Disposition');
            res.status(500).send("Error generating PDF: " + e.message);
        }
    }
}

module.exports = { postRegisterStudent, postLoginStudent, logOutAndRedirect, getDashboard, postRequestTranscript, getVerificationHistory, downloadCertificatePDF };
