let logger = require("../services/logger");
let encryption = require('../services/encryption');
let certificates = require('../database/models/certificates');
let students = require('../database/models/students');
let AuditLog = require('../database/models/auditlog');
let moment = require('moment');

let QRCode = require('qrcode');
const { parse } = require('csv-parse/sync');
const chaincode = require('../services/fabric/chaincode');


/*
 * ============================================================================
 * FILE: web-app/controllers/verify-controller.js
 * ============================================================================
 * 
 * PURPOSE:
 *   Handles the public Verification portal. Allows anyone (employers, agencies)
 *   to upload a Zero Knowledge Proof, a Roll Number, or a CSV file to check 
 *   if a certificate is cryptographically valid and not revoked.
 * ============================================================================
 */


let title = "Verification Portal";
let root = "verify";

/**
 * Verify certificate using Merkle tree proof object (advanced method).
 */

/*
 * ===== FUNCTION: postVerify =====
 * WHAT: The Zero Knowledge Proof (ZKP) verification engine.
 * HOW IT WORKS:
 *   1. User pastes a JSON object containing the `proof` (hashes) and `disclosedData` (visible fields).
 *   2. Cryptography engine attempts to rebuild the Root Hash.
 *   3. If valid, it checks if the university has since REVOKED it.
 *   4. If valid, it checks if it has EXPIRED.
 *   5. Logs the attempt in the Audit database.
 */
async function postVerify(req, res, next) {
    try {
        let proofObject = req.body.proofObject;

        try {
            proofObject = JSON.parse(proofObject);
        } catch (parseErr) {
            return res.render("verify-fail", {
                title, root,
                logInType: req.session.user_type || "none",
                message: "Invalid Proof Object. Please paste a valid JSON proof generated from the student dashboard."
            });
        }

        // They must disclose at least ONE piece of data, otherwise what are we verifying?
        if (!proofObject.disclosedData || Object.keys(proofObject.disclosedData).length === 0) {
            return res.render("verify-fail", {
                title, root,
                logInType: req.session.user_type || "none",
                message: "Invalid Proof Object. The proof must contain 'disclosedData' with at least one attribute."
            });
        }
        
        // Feed the proof into the encryption engine. Math happens here. Returns true or false.
        let proofIsCorrect = await encryption.verifyCertificateProof(proofObject.proof, proofObject.disclosedData, proofObject.certUUID);

        if (proofIsCorrect) {
            let certificateDbObject = await certificates.findOne({ "_id": proofObject.certUUID });

            // Check revocation
            if (certificateDbObject.revoked) {
                // We log *everything*, even (especially) failed / revoked checks. 
                await AuditLog.create({
                    action: 'certificate_verified',
                    targetCertId: proofObject.certUUID,
                    details: 'Proof verification attempted on REVOKED certificate',
                    ipAddress: req.ip
                });
                return res.render("verify-fail", {
                    title, root,
                    logInType: req.session.user_type || "none",
                    message: "⚠ This certificate has been REVOKED by the issuing university. Reason: " + (certificateDbObject.revokedReason || 'Not specified')
                });
            }

            // Check expiry
            if (certificateDbObject.expiryDate && new Date(certificateDbObject.expiryDate) < new Date()) {
                await AuditLog.create({
                    action: 'certificate_verified',
                    targetCertId: proofObject.certUUID,
                    details: 'Proof verification attempted on EXPIRED certificate',
                    ipAddress: req.ip
                });
                return res.render("verify-fail", {
                    title, root,
                    logInType: req.session.user_type || "none",
                    message: "⏰ This certificate has EXPIRED on " + moment(certificateDbObject.expiryDate).format('YYYY-MM-DD') + ". Please contact the issuing university."
                });
            }

            // Valid, not revoked, not expired!
            await AuditLog.create({
                action: 'certificate_verified',
                targetCertId: proofObject.certUUID,
                details: 'Certificate verified via Merkle proof',
                ipAddress: req.ip
            });

            // Fetch raw ledger data for "Etherscan-like" view so the employer can see the raw blockchain state
            let ledgerData = null;
            try {
                // Workaround: Chaincode doesn't have queryCertificate by ID directly (in this version), 
                // so we fetch all of the student's certs and filter it in Express.
                let student = await students.findOne({ email: certificateDbObject.studentEmail });
                if (student) {
                    let allCerts = await chaincode.invokeChaincode("getAllCertificateByStudent",
                        [student.publicKey], true, "admin");

                    // Find the specific cert
                    ledgerData = allCerts.find(c => c.certUUID === proofObject.certUUID) || null;
                    if (!ledgerData) throw new Error("Certificate not found in ledger array");
                } else {
                    throw new Error("Student not found for ledger query");
                }

            } catch (ledgerErr) {
                // logger.error("Failed to fetch ledger data: " + ledgerErr);
                ledgerData = { error: "Ledger Query Failed: " + (ledgerErr.message || ledgerErr) };
            }

            // Render success page, passing the specific disclosed data so the employer ONLY sees what was shared
            res.render("verify-success", {
                title, root,
                logInType: req.session.user_type || "none",
                certData: certificateDbObject,
                proofData: proofObject.disclosedData,
                verificationType: "proof", // Sets UI display mode
                ledgerData: ledgerData
            });

        } else {
            // Cryptography failed (tampered data or fake proof)
            res.render("verify-fail", {
                title, root,
                logInType: req.session.user_type || "none"
            });
        }

    } catch (e) {
        logger.error(e);
        next(e);
    }
}

/**
 * Verify certificate using Roll Number (simple method for employers).
 */

/*
 * ===== FUNCTION: postVerifyByRollNumber =====
 * WHAT: Simplifies verification. The employer types a Roll Number, the server fetches
 *   the entire certificate from DB, and the SERVER generates AND verifies the proof 
 *   automatically to ensure DB isn't out of sync with Blockchain.
 */
async function postVerifyByRollNumber(req, res, next) {
    try {
        let rollNumber = req.body.rollNumber;

        if (!rollNumber || rollNumber.trim().length === 0) {
            throw new Error("Please provide a valid Roll Number.");
        }

        let certificateDbObject = await certificates.findOne({ "rollNumber": rollNumber.trim() });

        if (!certificateDbObject) {
            return res.render("verify-fail", {
                title, root,
                logInType: req.session.user_type || "none",
                message: "No certificate found for Roll Number: " + rollNumber
            });
        }

        // Check revocation
        if (certificateDbObject.revoked) {
            await AuditLog.create({
                action: 'certificate_verified',
                targetCertId: certificateDbObject._id.toString(),
                details: 'Roll number verification attempted on REVOKED certificate',
                ipAddress: req.ip
            });
            return res.render("verify-fail", {
                title, root,
                logInType: req.session.user_type || "none",
                message: "⚠ This certificate has been REVOKED by the issuing university. Reason: " + (certificateDbObject.revokedReason || 'Not specified')
            });
        }

        // Check expiry
        if (certificateDbObject.expiryDate && new Date(certificateDbObject.expiryDate) < new Date()) {
            await AuditLog.create({
                action: 'certificate_verified',
                targetCertId: certificateDbObject._id.toString(),
                details: 'Roll number verification attempted on EXPIRED certificate',
                ipAddress: req.ip
            });
            return res.render("verify-fail", {
                title, root,
                logInType: req.session.user_type || "none",
                message: "⏰ This certificate has EXPIRED on " + moment(certificateDbObject.expiryDate).format('YYYY-MM-DD') + ". Please contact the issuing university."
            });
        }

        // Verify on blockchain automatically (behind the scenes)
        // We select these 4 fields to act as our Disclosed Data test.
        let allAttributes = ["universityName", "major", "departmentName", "cgpa"];
        let disclosedData = {};
        allAttributes.forEach(attr => {
            if (certificateDbObject[attr]) {
                disclosedData[attr] = certificateDbObject[attr];
            }
        });

        // The server generates the proof...
        let mTreeProof = await encryption.generateCertificateProof(allAttributes, certificateDbObject._id.toString(), certificateDbObject.universityEmail);
        
        // ...and immediately verifies it against the blockchain state to ensure DB wasn't hacked
        let proofIsCorrect = await encryption.verifyCertificateProof(mTreeProof, disclosedData, certificateDbObject._id.toString());

        if (proofIsCorrect) {
            await AuditLog.create({
                action: 'certificate_verified',
                targetCertId: certificateDbObject._id.toString(),
                details: 'Certificate verified via roll number lookup',
                ipAddress: req.ip
            });

            // Fetch raw ledger data for "Etherscan-like" view
            let ledgerData = null;
            try {
                // Workaround: Chaincode doesn't have queryCertificate, so we fetch all student certs and filter
                let student = await students.findOne({ email: certificateDbObject.studentEmail });
                if (student) {
                    let allCerts = await chaincode.invokeChaincode("getAllCertificateByStudent",
                        [student.publicKey], true, "admin");

                    // Find the specific cert
                    ledgerData = allCerts.find(c => c.certUUID === certificateDbObject._id.toString()) || null;
                    if (!ledgerData) throw new Error("Certificate not found in ledger array");
                } else {
                    throw new Error("Student not found for ledger query");
                }
            } catch (ledgerErr) {
                // logger.error("Failed to fetch ledger data: " + ledgerErr);
                ledgerData = { error: "Ledger Query Failed: " + (ledgerErr.message || ledgerErr) };
            }

            res.render("verify-success", {
                title, root,
                logInType: req.session.user_type || "none",
                certData: certificateDbObject,
                proofData: disclosedData, // Sends the visible data
                verificationType: "rollnumber",
                ledgerData: ledgerData
            });
        } else {
            res.render("verify-fail", {
                title, root,
                logInType: req.session.user_type || "none",
                message: "Certificate found but blockchain verification failed. The certificate data may have been tampered with."
            });
        }

    } catch (e) {
        logger.error(e);
        next(e);
    }
}

// Bulk Verification Page Load
async function getBulkVerifyPage(req, res, next) {
    res.render("verify-bulk", {
        title, root,
        logInType: req.session.user_type || "none",
        results: null,
        errorMessage: null
    });
}

// Process Bulk Verification CSV

/*
 * ===== FUNCTION: postBulkVerify =====
 * WHAT: Allows employers to upload a `.csv` file containing hundreds of Roll Numbers
 *   (e.g., verifying 500 job applicants at once).
 * HOW IT WORKS:
 *   1. Express-Multer parses the uploaded CSV file from memory.
 *   2. Loops through every roll number.
 *   3. Performs the exact same DB -> DB-to-Blockchain verification loop as `postVerifyByRollNumber`.
 *   4. Returns an array of Results which is rendered in a clean HTML table.
 */
async function postBulkVerify(req, res, next) {
    try {
        if (!req.file) {
            return res.render("verify-bulk", {
                title, root,
                logInType: req.session.user_type || "none",
                results: null,
                errorMessage: "Please upload a CSV file."
            });
        }

        // Read the CSV file out of RAM buffer
        const csvContent = req.file.buffer.toString('utf-8');
        const records = parse(csvContent, {
            columns: true, // Treat the first row as the header names
            skip_empty_lines: true,
            trim: true
        });

        let results = [];
        let allAttributes = ["universityName", "major", "departmentName", "cgpa"];

        // Loop over every row in the CSV
        for (let record of records) {
            let rollNumber = record.rollNumber || record.roll_number;

            if (!rollNumber) {
                results.push({ rollNumber: 'N/A', status: 'failed', message: 'Missing Roll Number in CSV row' });
                continue; // Move to the next row
            }

            try {
                let cert = await certificates.findOne({ "rollNumber": rollNumber.trim() });

                // Check simple database existence
                if (!cert) {
                    results.push({ rollNumber: rollNumber, status: 'failed', message: 'Certificate not found' });
                    continue;
                }

                // Check revocation
                if (cert.revoked) {
                    results.push({ rollNumber: rollNumber, status: 'failed', message: 'REVOKED: ' + (cert.revokedReason || 'No reason') });
                    continue;
                }

                // Check expiry
                if (cert.expiryDate && new Date(cert.expiryDate) < new Date()) {
                    results.push({ rollNumber: rollNumber, status: 'failed', message: 'EXPIRED on ' + moment(cert.expiryDate).format('YYYY-MM-DD') });
                    continue;
                }

                // Verify on blockchain (cryptographic math check)
                let disclosedData = {};
                allAttributes.forEach(attr => {
                    if (cert[attr]) disclosedData[attr] = cert[attr];
                });

                let mTreeProof = await encryption.generateCertificateProof(allAttributes, cert._id.toString(), cert.universityEmail);
                let proofIsCorrect = await encryption.verifyCertificateProof(mTreeProof, disclosedData, cert._id.toString());

                if (proofIsCorrect) {
                    // Passed all checks!
                    results.push({
                        rollNumber: rollNumber,
                        status: 'success',
                        message: 'Valid',
                        details: `${cert.studentName} (${cert.major}) - ${cert.universityName}`
                    });
                } else {
                    results.push({ rollNumber: rollNumber, status: 'failed', message: 'Blockchain verification failed' });
                }

            } catch (rowErr) {
                results.push({ rollNumber: rollNumber, status: 'failed', message: 'Error: ' + rowErr.message });
            }
        }

        // Render the results page with the array of status updates
        res.render("verify-bulk", {
            title, root,
            logInType: req.session.user_type || "none",
            results: results,
            errorMessage: null
        });

    } catch (e) {
        logger.error(e);
        res.render("verify-bulk", {
            title, root,
            logInType: req.session.user_type || "none",
            results: null,
            errorMessage: "Failed to process CSV: " + e.message
        });
    }
}

module.exports = { postVerify, postVerifyByRollNumber, getBulkVerifyPage, postBulkVerify };