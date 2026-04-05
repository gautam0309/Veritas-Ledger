let universities = require('../database/models/universities');
let students = require('../database/models/students');
let certificates = require('../database/models/certificates');
let fabricEnrollment = require('../services/fabric/enrollment');
let chaincode = require('../services/fabric/chaincode');
let logger = require("../services/logger");
let universityService = require("../services/university-service");
let pdfGenerator = require("../services/pdf-generator");
let AuditLog = require("../database/models/auditlog");
let emailService = require("../services/email-service");
let identityHelper = require("../services/identity-helper");
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { parse } = require('csv-parse/sync');
const { validationResult } = require('express-validator');

/*
 * ============================================================================
 * FILE: web-app/controllers/university-controller.js
 * ============================================================================
 * 
 * PURPOSE:
 *   Handles all business logic for Universities: registration, login, issuing 
 *   single certificates, bulk issuing via CSV, revoking certificates, and 
 *   providing analytics. 
 * ============================================================================
 */


/*
 * Multer Config: Certificate Image Uploads 
 * WHAT: Middleware that intercepts multi-part form data (images) and saves them to the server disk.
 * WHY: We need a physical location (`/public/uploads`) to store the scanned physical certificates.
 */
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, '../public/uploads'));
    },
    filename: function (req, file, cb) {
        // Prevent file clashes by appending the timestamp to the original extension
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB hard limit per file
    fileFilter: function (req, file, cb) {
        const allowedTypes = /jpeg|jpg|png|pdf/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (extname && mimetype) cb(null, true);
        else cb(new Error('Only JPEG, PNG, and PDF files are allowed'));
    }
});

/*
 * Multer Config: CSV Bulk Uploads
 * WHAT: We use `memoryStorage()` instead of `diskStorage()` here.
 * WHY: We don't need to save the CSV file forever. We just read it into RAM, 
 *   process the rows, and then let NodeJS Garbage Collection throw it away.
 */
const csvUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit for CSV
    fileFilter: function (req, file, cb) {
        if (path.extname(file.originalname).toLowerCase() === '.csv') cb(null, true);
        else cb(new Error('Only CSV files are allowed'));
    }
});


let title = "University";
let root = "university";

/*
 * ===== FUNCTION: postRegisterUniversity =====
 * WHAT: Bootstraps a new University into both MongoDB and the Hyperledger Fabric CA.
 */
async function postRegisterUniversity(req, res, next) {
    try {
        let { name, email, password, passwordConfirm, description, location } = req.body;

        // 1. Tell Hyperledger Fabric CA to create cryptographic keys for this university
        let keys = await fabricEnrollment.registerUser(req.body.email);
        location = req.body.location + `, ${req.body.country}`;

        // 2. Store the University profile in the standard database
        let dbResponse = await universities.create({
            name: req.body.name,
            email: req.body.email,
            description: req.body.description,
            location: location,
            password: req.body.password,
            publicKey: keys.publicKey
        });

        // 3. Register the University as an Organization on the Blockchain itself
        // Note: the final parameter 'req.body.email' acts as their identity context.
        let result = await chaincode.invokeChaincode("registerUniversity",
            [req.body.name, keys.publicKey, location, req.body.description], false, req.body.email);
        logger.debug(`University Registered. Ledger profile: ${result}`);

        // 4. Audit Trail
        await AuditLog.create({
            action: 'registration',
            performedBy: req.body.email,
            details: `University "${req.body.name}" registered`,
            ipAddress: req.ip
        });

        // 5. Fire external Email confirmation
        emailService.notifyRegistration(req.body.email, req.body.name, 'university');

        res.render("register-success", {
            title, root,
            logInType: req.session.user_type || "none"
        });
    }
    catch (e) {
        logger.error(e);
        const errorString = e.message || e.toString();
        // E11000 is Mongo's standard code for Unique Index Collisions (meaning email is taken)
        if (e.code === 11000 || errorString.includes('already exists') || errorString.includes('already registered')) {
            return res.render("register-university", {
                title, root,
                logInType: req.session.user_type || "none",
                registered: false,
                error: "Registration failed. Please ensure the data provided is correct and the email is not already in use."
            });
        }
        next(e); // Unhandled errors go to Express error handler
    }
}

/*
 * ===== FUNCTION: postLoginUniversity =====
 * WHAT: Secures the login process, checks passwords, rotates sessions for security, 
 *   and populates the Express request session data.
 */
async function postLoginUniversity(req, res, next) {
    try {
        // Mongoose custom method containing bcrypt comparison
        let universityObject = await universities.validateByCredentials(req.body.email, req.body.password)

        // SECURITY: Prevent Session Fixation 
        // We delete the old cookie identity entirely and create a new one post-validation.
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

        req.session.user_id = universityObject._id;
        req.session.user_type = "university";
        req.session.email = universityObject.email;
        req.session.name = universityObject.name;

        // Self-healing: If the local `.id` file (wallet) was lost on disk, recreate it from MongoDB.
        await identityHelper.ensureIdentity(universityObject.email);

        await AuditLog.create({
            action: 'login',
            performedBy: req.body.email,
            details: 'University login',
            ipAddress: req.ip
        });

        return res.redirect("/university/dashboard")
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


/*
 * ===== FUNCTION: postIssueCertificate =====
 * WHAT: Issues a single certificate. 
 * WHY IS THIS COMPLEX? Because it has to save data to MongoDB, run cryptographic Merkle Tree
 *   computations, save the Hashes to the Hyperledger Fabric chaincode, AND upload an image.
 */
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

        if (req.body.expiryDate) {
            certData.expiryDate = req.body.expiryDate;
        }

        // If the Express-Multer middleware found a file in the form, attach the new file path
        if (req.file) {
            certData.certificateImage = '/uploads/' + req.file.filename;
        }

        // Send to our massive abstraction layer that handles the math and blockchain connections
        let serviceResponse = await universityService.issueCertificate(certData);

        // Security logging
        await AuditLog.create({
            action: 'certificate_issued',
            performedBy: req.session.email,
            targetCertId: serviceResponse.certId || '', // The MongoDB Object _id
            details: `Certificate issued to ${req.body.studentName} (${req.body.studentEmail})`,
            ipAddress: req.ip
        });

        // Email the student telling them they have a new certificate in their wallet
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
        
        // Custom friendlier error formatting for known edge cases
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

/*
 * ===== FUNCTION: getDashboard =====
 * WHAT: The main admin view for universities. Fetches all issued certificates.
 */
async function getDashboard(req, res, next) {
    try {
        await identityHelper.ensureIdentity(req.session.email);

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

/*
 * ===== FUNCTION: postRevokeCertificate =====
 * WHAT: Allows universities to permanently and publicly revoke a certificate (e.g. academic fraud).
 * HOW IT WORKS: It updates MongoDB to show a "REVOKED" badge, and then updates the Blockchain Ledger.
 *   This is an irreversible cryptographic action on the Blockchain.
 */
async function postRevokeCertificate(req, res, next) {
    try {
        let certId = req.body.certId;
        let reason = req.body.reason || 'No reason provided';

        let cert = await certificates.findById(certId);
        if (!cert) {
            return res.status(404).json({ error: 'Certificate not found' });
        }

        // SECURITY (IDOR Fix): You cannot revoke a certificate issued by Harvard if you are Yale.
        if (cert.universityEmail !== req.session.email) {
            return res.status(403).json({ error: 'You can only revoke certificates issued by your university' });
        }

        // Tell the Blockchain. This modifies the Smart Contract state asynchronously.
        await universityService.revokeCertificateOnChain(certId, reason, req.session.email);

        // Update MongoDB for quick UI access
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

        // Email notification of revocation
        emailService.notifyCertificateRevoked(cert.studentEmail, cert.studentName, req.session.name, reason);

        return res.redirect('/university/dashboard');
    } catch (e) {
        logger.error(e);
        next(e);
    }
}

/*
 * ===== FUNCTION: downloadCertificatePDF =====
 * WHAT: Re-usable PDF renderer. Allows university registrars to download copies of diplomas.
 */
async function downloadCertificatePDF(req, res, next) {
    try {
        let certId = req.params.certId;
        let cert = await certificates.findById(certId);

        if (!cert) {
            return res.status(404).send('Certificate not found');
        }

        // SECURITY (IDOR Fix): Similar to revoke, only the issuer can download it.
        if (cert.universityEmail !== req.session.email) {
            return res.status(403).send('Unauthorized: You can only download certificates issued by your university.');
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


/*
 * ===== FUNCTION: postBatchIssue =====
 * WHAT: Huge enhancement over normal issuance. Processes a CSV file of hundreds of rows.
 * HOW IT WORKS DYNAMICALLY: 
 *   Instead of firing 500 blockchain API calls at once and crashing Hyperledger, 
 *   this uses `chunking`. It groups rows into batches of 10, runs `Promise.allSettled`, 
 *   waits for them to finish, and then does the next 10.
 */
async function getBatchIssuePage(req, res, next) {
    res.render("batch-issue", {
        title, root,
        logInType: req.session.user_type || "none",
        results: null,
        errorMessage: null
    });
}

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
        let count = 0;
        console.log(`Starting batch issuance for ${records.length} records...`);

        // Loop array in 10-item slices
        for (let i = 0; i < records.length; i += 10) {
            const chunk = records.slice(i, i + 10);
            process.stdout.write(`\nProcessing chunk [${i + 1} - ${Math.min(i + 10, records.length)}] out of ${records.length}...\n`);

            // Generate an array of 10 Async Promises
            const chunkPromises = chunk.map(async (record) => {
                try {
                    let certData = {
                        rollNumber: record.rollNumber || record.rollNo || record.roll_number,
                        studentEmail: record.studentEmail || record.student_email || record.email,
                        studentName: record.studentName || record.student_name || record.name,
                        universityName: req.session.name,
                        universityEmail: req.session.email,
                        major: record.major,
                        departmentName: record.department || record.departmentName,
                        cgpa: record.cgpa || record.CGPA,
                        dateOfIssuing: record.date || record.dateOfIssuing || new Date().toISOString().split('T')[0],
                    };

                    // Wait for blockchain to register the data
                    await universityService.issueCertificate(certData);
                    await AuditLog.create({
                        action: 'certificate_issued',
                        performedBy: req.session.email,
                        details: `Batch: Certificate issued to ${certData.studentName} (${certData.studentEmail})`,
                        ipAddress: req.ip
                    });
                    
                    // Return positive mapping for the Results Table Array
                    return { student: certData.studentName || 'Unknown', status: 'success', message: 'Certificate issued' };
                } catch (rowErr) {
                    // Map known error strings
                    let msg = rowErr.message;
                    if (msg.includes("student profile")) msg = "Student not registered";
                    if (msg.includes("duplicate key") || msg.includes("E11000")) msg = "Duplicate certificate";
                    return { student: record.studentName || record.name || 'Unknown', status: 'failed', message: msg };
                }
            });

            // Promise.allSettled runs them concurrently without failing the whole batch if ONE fails
            const chunkResults = await Promise.allSettled(chunkPromises);
            const formattedResults = chunkResults.map(res =>
                res.status === 'fulfilled' ? res.value : { student: 'Unknown Error', status: 'failed', message: res.reason?.message || 'Unexpected failure' }
            );
            
            // Push results from this chunk onto the master Array
            results.push(...formattedResults);
        }

        // Push mapping to view template
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


/*
 * ===== FUNCTION: postBatchRegister =====
 * WHAT: Like batch issuance, but registers raw student profiles. 
 * WHY: Students shouldn't need perfectly manual signup. Universities often bulk 
 *   onboard an entire class via CSV files exported from their internal ERP system.
 */
async function getBatchRegisterPage(req, res, next) {
    res.render("batch-register", {
        title, root,
        logInType: req.session.user_type || "none",
        results: null,
        errorMessage: null
    });
}

async function postBatchRegister(req, res, next) {
    try {
        if (!req.file) {
            return res.render("batch-register", {
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
        let count = 0;
        console.log(`Starting batch registration for ${records.length} records...`);

        // Concurrent chunking (exact same principle as chunking above)
        for (let i = 0; i < records.length; i += 10) {
            const chunk = records.slice(i, i + 10);
            process.stdout.write(`\nRegistering chunk [${i + 1} - ${Math.min(i + 10, records.length)}] out of ${records.length}...\n`);

            const chunkPromises = chunk.map(async (record) => {
                const name = record.studentName || record.student_name || record.name;
                const email = record.studentEmail || record.student_email || record.email;
                const password = record.password || 'TempPass123!';

                try {
                    if (!name || !email) {
                        throw new Error("Name and Email are required");
                    }

                    const existing = await students.findOne({ email });
                    if (existing) {
                        return { student: name, status: 'failed', message: 'Already registered' };
                    }

                    // Blockchain Identity Creation
                    let keys = await fabricEnrollment.registerUser(email);

                    // MongoDB Record Storage
                    await students.create({
                        name: name,
                        email: email,
                        password: password,
                        publicKey: keys.publicKey
                    });

                    await AuditLog.create({
                        action: 'registration',
                        performedBy: req.session.email,
                        details: `Batch: Student "${name}" (${email}) registered by university`,
                        ipAddress: req.ip
                    });

                    emailService.notifyRegistration(email, name, 'student');
                    return { student: name, status: 'success', message: 'Student registered' };
                } catch (rowErr) {
                    return { student: name || 'Unknown', status: 'failed', message: rowErr.message };
                }
            });

            const chunkResults = await Promise.allSettled(chunkPromises);
            const formattedResults = chunkResults.map(res =>
                res.status === 'fulfilled' ? res.value : { student: 'Unknown Error', status: 'failed', message: res.reason?.message || 'Unexpected failure' }
            );
            results.push(...formattedResults);
        }

        res.render("batch-register", {
            title, root,
            logInType: req.session.user_type || "none",
            results: results,
            errorMessage: null
        });

    } catch (e) {
        logger.error(e);
        res.render("batch-register", {
            title, root,
            logInType: req.session.user_type || "none",
            results: null,
            errorMessage: "Failed to process CSV: " + e.message
        });
    }
}

/*
 * ===== FUNCTION: getAnalyticsData =====
 * WHAT: Returns a JSON API payload used by the Chart.js widgets on the university dashboard.
 *   Calculates complex queries (like 'count by department' and 'average CGPA') directly 
 *   within MongoDB rather than downloading thousands of documents to Node.js.
 */
async function getAnalyticsData(req, res, next) {
    try {
        const universityEmail = req.session.email;
        const range = req.query.range || '6m';

        // MongoDB Aggregation Pipeline: 
        // 1. Matches this university.
        // 2. Groups them by their 'departmentName'.
        // 3. Counts them by sum (+1)
        // 4. Averages the double-conversion string variable 'cgpa'.
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

        // Calculate Timeseries issuance filtering over time
        let startDate = new Date();
        let endDate = new Date(); // Defaults to now

        // Check our simple frontend date query payload variables
        if (range === 'custom' && req.query.startDate && req.query.endDate) {
            startDate = new Date(req.query.startDate);
            endDate = new Date(req.query.endDate);

            // Basic Date Validation
            if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
                return res.status(400).json({ error: "Invalid date format provided" });
            }

            // Ensure end date includes the full day
            endDate.setHours(23, 59, 59, 999);
        } else if (range === '6m') {
            startDate.setMonth(startDate.getMonth() - 6);
        } else if (range === '1y') {
            startDate.setFullYear(startDate.getFullYear() - 1);
        } else if (range === '2y') {
            startDate.setFullYear(startDate.getFullYear() - 2);
        } else if (range === '3y') {
            startDate.setFullYear(startDate.getFullYear() - 3);
        } else if (range === 'lifetime') {
            startDate = new Date(0); // Beginning of UNIX epoch time
        }

        // Another Pipeline - Grouping by Year-Month Format
        const timeStats = await certificates.aggregate([
            {
                $match: {
                    universityEmail: universityEmail,
                    dateOfIssuing: { $gte: startDate, $lte: endDate }
                }
            },
            {
                $group: {
                    // Extract strictly Year and Month: '2024-03'
                    _id: { $dateToString: { format: "%Y-%m", date: "$dateOfIssuing" } },
                    count: { $sum: 1 }
                }
            },
            { $sort: { "_id": 1 } } // Sort chronologically so graphs don't zig-zag
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
    getBatchRegisterPage,
    postBatchRegister,
    getAnalyticsData,
    upload,
    csvUpload
};