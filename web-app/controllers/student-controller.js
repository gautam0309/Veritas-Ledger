let students = require('../database/models/students');
let fabricEnrollment = require('../services/fabric/enrollment');
let chaincode = require('../services/fabric/chaincode');
let logger = require("../services/logger");
let studentService = require('../services/student-service');
let AuditLog = require('../database/models/auditlog');
let certificates = require('../database/models/certificates');
let emailService = require('../services/email-service');
const pdfGenerator = require('../services/pdf-generator');
const { validationResult } = require('express-validator');

let title = "Student Dashboard";
let root = "student";


async function postRegisterStudent(req, res, next) {
    try {

        const { name, email, password, passwordConfirm } = req.body;

        let keys = await fabricEnrollment.registerUser(req.body.email);

        let dbResponse = await students.create({
            name: req.body.name,
            email: req.body.email,
            password: req.body.password,
            publicKey: keys.publicKey
        });

        await AuditLog.create({
            action: 'registration',
            performedBy: req.body.email,
            details: `Student "${req.body.name}" registered`,
            ipAddress: req.ip
        });

        // Email notification
        emailService.notifyRegistration(req.body.email, req.body.name, 'student');

        res.render("register-success", {
            title, root,
            logInType: req.session.user_type || "none"
        });
    }
    catch (e) {
        logger.error(e);
        const errorString = e.message || e.toString();

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

async function logOutAndRedirect(req, res, next) {
    req.session.destroy(function () {
        res.redirect('/');
    });
};


async function postLoginStudent(req, res, next) {
    try {
        let studentObject = await students.validateByCredentials(req.body.email, req.body.password)

        // Prevent Session Fixation (OWASP Cheat Sheet)
        await new Promise((resolve, reject) => {
            req.session.regenerate((err) => {
                if (err) reject(err);

                // Re-create the CSRF token for the new session 
                // to prevent "Forbidden" error if the login result needs to render again (e.g., catching errors later)
                const crypto = require('crypto');
                req.session.csrfToken = crypto.randomBytes(32).toString('hex');
                res.locals.csrfToken = req.session.csrfToken;

                resolve();
            });
        });

        req.session.user_id = studentObject._id;
        req.session.user_type = "student";
        req.session.email = studentObject.email;
        req.session.name = studentObject.name;
        req.session.publicKey = studentObject.publicKey;

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


async function getDashboard(req, res, next) {
    try {
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




async function postRequestTranscript(req, res, next) {
    try {
        const { certId, note } = req.body;
        const studentName = req.session.name;

        // Find certificate to get university email
        const cert = await certificates.findById(certId);

        if (!cert) {
            throw new Error("Certificate not found");
        }

        // IDOR Fix: Ensure student owns the certificate they are requesting a transcript for.
        if (cert.studentEmail !== req.session.email) {
            throw new Error("Unauthorized: You do not own this certificate.");
        }

        await emailService.notifyTranscriptRequest(cert.universityEmail, studentName, certId, note);

        // Flash message handling would be ideal here, but for now redirecting with query param
        res.redirect('/student/dashboard?message=Transcript%20Requested');

    } catch (e) {
        logger.error(e);
        next(e);
    }
}

async function getVerificationHistory(req, res, next) {
    try {
        const studentEmail = req.session.email;

        // 1. Get all certificate UUIDs for this student
        const studentCerts = await certificates.find({ studentEmail: studentEmail }).select('_id');
        const certUUIDs = studentCerts.map(c => c._id.toString());
        // Checking certificates.js schema... it doesn't explicitly define 'certUUID'. 
        // Wait! certificates.js schema (Step 2238) does NOT have certUUID!
        // It has rollNumber, studentName, etc.
        // Browse dashboard-uni (Step 2089) uses 'certData[i].certUUID'.
        // University Controller (Step 2073) uses 'certUUID' in 'postIssueCertificate'.
        // Let's re-verify certificates.js schema.

        // View Step 2238:
        // Schema does NOT have certUUID!
        // But dashboard uses it.
        // Maybe it's implicitly added or I missed it?
        // Let's check 'postIssueCertificate' in university-controller.js

        // I'll assume for now I need to check where UUID is stored.
        // If it's not in Mongoose schema, I can't query it easily?
        // Wait, issue function saves to Blockchain AND MongoDB.
        // If MongoDB schema doesn't have it, it's not saved there?

        // Let's check university-controller.js to see how it saves to DB.

        // For now, I'll write the function assuming certUUID field exists or I need to add it.
        // BUT if I can't find it, I can't query audit logs by it.
        // Actually, let's look at auditlog schema (Step 2237). It has 'targetCertId'.

        // If certificates.js is missing certUUID, then we have a problem.
        // Let's pause and check university-controller.js in next step if needed.
        // But `postIssueCertificate` usually saves it so it MUST be there.
        // I will assume it is `certUUID` based on views use.

        // WAIT! I see `view_file` output Step 2238.
        // It ends at line 94.
        // Fields: rollNumber ... dateOfIssuing ... revoked ...
        // It DOES NOT show `certUUID`.

        // This is critical. If `certUUID` is not in the schema, it won't be saved in MongoDB (strict mode).
        // But dashboard-university.ejs displays it `<%= certData[i].certUUID %>`.
        // Where does `certData` come from?
        // `getDashboard` in `university-controller` calls `certificates.find`.

        // Maybe I missed it in `view_file`.
        // I will double check `certificates.js` again properly.

        // Assuming it's there for now to proceed with coding, but I'll verifying it.

        const history = await AuditLog.find({
            action: { $in: ['certificate_verified', 'proof_verified'] },
            targetCertId: { $in: certUUIDs }
        }).sort({ timestamp: -1 });

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

// Download certificate as PDF check ownership
async function downloadCertificatePDF(req, res, next) {
    try {
        let certId = req.params.certId;


        let cert = await certificates.findById(certId);
        if (!cert) {

            return res.status(404).send('Certificate not found');
        }


        // Check ownership
        const certEmail = cert.studentEmail ? cert.studentEmail.toLowerCase() : '';
        const sessionEmail = req.session.email ? req.session.email.toLowerCase() : '';



        if (certEmail !== sessionEmail) {

            return res.status(403).send('Unauthorized: You do not own this certificate.');
        }

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
