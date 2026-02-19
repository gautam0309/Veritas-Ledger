let universities = require('../database/models/universities');
let certificates = require('../database/models/certificates');
let fabricEnrollment = require('../services/fabric/enrollment');
let chaincode = require('../services/fabric/chaincode');
let logger = require("../services/logger");
let universityService = require("../services/university-service");
let pdfGenerator = require("../services/pdf-generator");
let AuditLog = require("../database/models/auditlog");
let emailService = require("../services/email-service");
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { parse } = require('csv-parse/sync');

// Multer config for cert image upload
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, '../public/uploads'));
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: function (req, file, cb) {
        const allowedTypes = /jpeg|jpg|png|pdf/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        if (extname) cb(null, true);
        else cb(new Error('Only JPEG, PNG, and PDF files are allowed'));
    }
});

// Multer config for CSV upload
const csvUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: function (req, file, cb) {
        if (path.extname(file.originalname).toLowerCase() === '.csv') cb(null, true);
        else cb(new Error('Only CSV files are allowed'));
    }
});


let title = "University";
let root = "university";


async function postRegisterUniversity(req, res, next) {
    try {
        let keys = await fabricEnrollment.registerUser(req.body.email);
        let location = req.body.location + `, ${req.body.country}`;

        let dbResponse = await universities.create({
            name: req.body.name,
            email: req.body.email,
            description: req.body.description,
            location: location,
            password: req.body.password,
            publicKey: keys.publicKey
        });

        let result = await chaincode.invokeChaincode("registerUniversity",
            [req.body.name, keys.publicKey, location, req.body.description], false, req.body.email);
        logger.debug(`University Registered. Ledger profile: ${result}`);

        // Audit log
        await AuditLog.create({
            action: 'registration',
            performedBy: req.body.email,
            details: `University "${req.body.name}" registered`,
            ipAddress: req.ip
        });

        // Email notification
        emailService.notifyRegistration(req.body.email, req.body.name, 'university');

        res.render("register-success", {
            title, root,
            logInType: req.session.user_type || "none"
        });
    }
    catch (e) {
        logger.error(e);
        next(e);
    }
}

async function postLoginUniversity(req, res, next) {
    try {
        let universityObject = await universities.validateByCredentials(req.body.email, req.body.password)
        req.session.user_id = universityObject._id;
        req.session.user_type = "university";
        req.session.email = universityObject.email;
        req.session.name = universityObject.name;

        await AuditLog.create({
            action: 'login',
            performedBy: req.body.email,
            details: 'University login',
            ipAddress: req.ip
        });

        return res.redirect("/university/issue")
    } catch (e) {
        logger.error(e);
        res.render('login-university', {
            title, root,
            logInType: req.session.user_type || "none",
            errorMessage: "Invalid email or password. Please try again."
        });
    }
}

async function logOutAndRedirect(req, res, next) {
    req.session.destroy(function () {
        res.redirect('/');
    });
}

async function postIssueCertificate(req, res, next) {
    try {
        let certData = {
            rollNumber: req.body.rollNumber,
            studentEmail: req.body.studentEmail,
            studentName: req.body.studentName,
            universityName: req.session.name,
            universityEmail: req.session.email,
            major: req.body.major,
            departmentName: req.body.department,
            cgpa: req.body.cgpa,
            dateOfIssuing: req.body.date,
        };

        // Add optional expiry date
        if (req.body.expiryDate) {
            certData.expiryDate = req.body.expiryDate;
        }

        // Add certificate image path if uploaded
        if (req.file) {
            certData.certificateImage = '/uploads/' + req.file.filename;
        }

        let serviceResponse = await universityService.issueCertificate(certData);

        // Audit log
        await AuditLog.create({
            action: 'certificate_issued',
            performedBy: req.session.email,
            targetCertId: serviceResponse.certId || '',
            details: `Certificate issued to ${req.body.studentName} (${req.body.studentEmail})`,
            ipAddress: req.ip
        });

        // Email notification
        emailService.notifyCertificateIssued(req.body.studentEmail, req.body.studentName, req.session.name, req.body.major);

        if (serviceResponse) {
            res.render("issue-success", {
                title, root,
                logInType: req.session.user_type || "none"
            });
        }

    } catch (e) {
        logger.error(e);
        let errorMsg = e.message || "An unexpected error occurred.";
        if (errorMsg.includes("student profile")) {
            errorMsg = "Student with this email is not registered. The student must register on the platform first before a certificate can be issued.";
        }
        if (errorMsg.includes("duplicate key") || errorMsg.includes("E11000")) {
            errorMsg = "A certificate has already been issued to this roll number by your university. Duplicate certificates are not allowed.";
        }
        res.render("issue-university", {
            title, root,
            logInType: req.session.user_type || "none",
            errorMessage: errorMsg
        });
    }
}

async function getDashboard(req, res, next) {
    try {
        let certData = await universityService.getCertificateDataforDashboard(req.session.name, req.session.email);
        res.render("dashboard-university", {
            title, root, certData,
            logInType: req.session.user_type || "none"
        });

    } catch (e) {
        logger.error(e);
        next(e);
    }
}

// Revoke a certificate
async function postRevokeCertificate(req, res, next) {
    try {
        let certId = req.body.certId;
        let reason = req.body.reason || 'No reason provided';

        let cert = await certificates.findById(certId);
        if (!cert) {
            return res.status(404).json({ error: 'Certificate not found' });
        }

        // Only the issuing university can revoke
        if (cert.universityEmail !== req.session.email) {
            return res.status(403).json({ error: 'You can only revoke certificates issued by your university' });
        }

        cert.revoked = true;
        cert.revokedReason = reason;
        cert.revokedAt = new Date();
        await cert.save();

        await AuditLog.create({
            action: 'certificate_revoked',
            performedBy: req.session.email,
            targetCertId: certId,
            details: `Certificate revoked. Reason: ${reason}`,
            ipAddress: req.ip
        });

        // Email notification
        emailService.notifyCertificateRevoked(cert.studentEmail, cert.studentName, req.session.name, reason);

        return res.redirect('/university/dashboard');
    } catch (e) {
        logger.error(e);
        next(e);
    }
}

// Download certificate as PDF
async function downloadCertificatePDF(req, res, next) {
    try {
        let certId = req.params.certId;
        let cert = await certificates.findById(certId);

        if (!cert) {
            return res.status(404).send('Certificate not found');
        }

        let pdfBuffer = await pdfGenerator.generateCertificatePDF({
            studentName: cert.studentName,
            major: cert.major,
            departmentName: cert.departmentName,
            universityName: cert.universityName,
            rollNumber: cert.rollNumber,
            cgpa: cert.cgpa,
            dateOfIssuing: cert.dateOfIssuing ? cert.dateOfIssuing.toISOString().split('T')[0] : 'N/A',
            certUUID: cert._id.toString()
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=certificate-${cert.rollNumber}.pdf`);
        res.send(pdfBuffer);

    } catch (e) {
        logger.error(e);
        next(e);
    }
}

// Batch CSV issuance page
async function getBatchIssuePage(req, res, next) {
    res.render("batch-issue", {
        title, root,
        logInType: req.session.user_type || "none",
        results: null,
        errorMessage: null
    });
}

// Process batch CSV
async function postBatchIssue(req, res, next) {
    try {
        if (!req.file) {
            return res.render("batch-issue", {
                title, root,
                logInType: req.session.user_type || "none",
                results: null,
                errorMessage: "Please upload a CSV file."
            });
        }

        const csvContent = req.file.buffer.toString('utf-8');
        const records = parse(csvContent, {
            columns: true,
            skip_empty_lines: true,
            trim: true
        });

        let results = [];
        for (let record of records) {
            try {
                let certData = {
                    rollNumber: record.rollNumber || record.roll_number,
                    studentEmail: record.studentEmail || record.student_email || record.email,
                    studentName: record.studentName || record.student_name || record.name,
                    universityName: req.session.name,
                    universityEmail: req.session.email,
                    major: record.major,
                    departmentName: record.department || record.departmentName,
                    cgpa: record.cgpa || record.CGPA,
                    dateOfIssuing: record.date || record.dateOfIssuing || new Date().toISOString().split('T')[0],
                };

                await universityService.issueCertificate(certData);
                results.push({ student: certData.studentName, status: 'success', message: 'Certificate issued' });

                await AuditLog.create({
                    action: 'certificate_issued',
                    performedBy: req.session.email,
                    details: `Batch: Certificate issued to ${certData.studentName} (${certData.studentEmail})`,
                    ipAddress: req.ip
                });
            } catch (rowErr) {
                let msg = rowErr.message;
                if (msg.includes("student profile")) msg = "Student not registered";
                if (msg.includes("duplicate key") || msg.includes("E11000")) msg = "Duplicate certificate";
                results.push({ student: record.studentName || record.name || 'Unknown', status: 'failed', message: msg });
            }
        }

        res.render("batch-issue", {
            title, root,
            logInType: req.session.user_type || "none",
            results: results,
            errorMessage: null
        });

    } catch (e) {
        logger.error(e);
        res.render("batch-issue", {
            title, root,
            logInType: req.session.user_type || "none",
            results: null,
            errorMessage: "Failed to process CSV: " + e.message
        });
    }
}


// Get analytics data for charts
async function getAnalyticsData(req, res, next) {
    try {
        const universityEmail = req.session.email;

        // 1. Certificates by Department & Avg CGPA
        const deptStats = await certificates.aggregate([
            { $match: { universityEmail: universityEmail } },
            {
                $group: {
                    _id: "$departmentName",
                    count: { $sum: 1 },
                    avgCgpa: { $avg: { $toDouble: "$cgpa" } }
                }
            }
        ]);

        // 2. Issuance over time (last 6 months)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        const timeStats = await certificates.aggregate([
            {
                $match: {
                    universityEmail: universityEmail,
                    dateOfIssuing: { $gte: sixMonthsAgo }
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m", date: "$dateOfIssuing" } },
                    count: { $sum: 1 }
                }
            },
            { $sort: { "_id": 1 } }
        ]);

        const totalIssued = await certificates.countDocuments({ universityEmail: universityEmail });

        res.json({
            deptStats,
            timeStats,
            totalIssued
        });

    } catch (e) {
        logger.error(e);
        res.status(500).json({ error: "Failed to fetch analytics data" });
    }
}

module.exports = {
    postRegisterUniversity,
    postLoginUniversity,
    logOutAndRedirect,
    postIssueCertificate,
    getDashboard,
    postRevokeCertificate,
    downloadCertificatePDF,
    getBatchIssuePage,
    postBatchIssue,
    getAnalyticsData,
    upload,
    csvUpload
};