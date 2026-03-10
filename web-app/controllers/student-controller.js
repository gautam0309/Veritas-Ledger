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

        
        await new Promise((resolve, reject) => {
            req.session.regenerate((err) => {
                if (err) reject(err);

                
                
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

        
        const cert = await certificates.findById(certId);

        if (!cert) {
            throw new Error("Certificate not found");
        }

        
        if (cert.studentEmail !== req.session.email) {
            throw new Error("Unauthorized: You do not own this certificate.");
        }

        await emailService.notifyTranscriptRequest(cert.universityEmail, studentName, certId, note);

        
        res.redirect('/student/dashboard?message=Transcript%20Requested');

    } catch (e) {
        logger.error(e);
        next(e);
    }
}

async function getVerificationHistory(req, res, next) {
    try {
        const studentEmail = req.session.email;

        
        const studentCerts = await certificates.find({ studentEmail: studentEmail }).select('_id');
        const certUUIDs = studentCerts.map(c => c._id.toString());
        
        
        
        
        
        

        
        
        
        
        

        
        
        
        

        

        
        
        

        
        
        
        

        
        
        
        

        
        
        
        

        
        

        

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


async function downloadCertificatePDF(req, res, next) {
    try {
        let certId = req.params.certId;


        let cert = await certificates.findById(certId);
        if (!cert) {

            return res.status(404).send('Certificate not found');
        }


        
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
