let logger = require("../services/logger");
let encryption = require('../services/encryption');
let certificates = require('../database/models/certificates');
let students = require('../database/models/students');
let AuditLog = require('../database/models/auditlog');
let moment = require('moment');

let QRCode = require('qrcode');
const { parse } = require('csv-parse/sync');
const chaincode = require('../services/fabric/chaincode');

let title = "Verification Portal";
let root = "verify";

/**
 * Verify certificate using Merkle tree proof object (advanced method).
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

        if (!proofObject.disclosedData || Object.keys(proofObject.disclosedData).length === 0) {
            return res.render("verify-fail", {
                title, root,
                logInType: req.session.user_type || "none",
                message: "Invalid Proof Object. The proof must contain 'disclosedData' with at least one attribute."
            });
        }
        let proofIsCorrect = await encryption.verifyCertificateProof(proofObject.proof, proofObject.disclosedData, proofObject.certUUID);

        if (proofIsCorrect) {
            let certificateDbObject = await certificates.findOne({ "_id": proofObject.certUUID });

            // Check revocation
            if (certificateDbObject.revoked) {
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

            await AuditLog.create({
                action: 'certificate_verified',
                targetCertId: proofObject.certUUID,
                details: 'Certificate verified via Merkle proof',
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
                    ledgerData = allCerts.find(c => c.certUUID === proofObject.certUUID) || null;
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
                proofData: proofObject.disclosedData,
                verificationType: "proof",
                ledgerData: ledgerData
            });

        } else {
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

        // Verify on blockchain
        let allAttributes = ["universityName", "major", "departmentName", "cgpa"];
        let disclosedData = {};
        allAttributes.forEach(attr => {
            if (certificateDbObject[attr]) {
                disclosedData[attr] = certificateDbObject[attr];
            }
        });

        let mTreeProof = await encryption.generateCertificateProof(allAttributes, certificateDbObject._id.toString(), certificateDbObject.universityEmail);
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
                proofData: disclosedData,
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

// Bulk Verification Page
async function getBulkVerifyPage(req, res, next) {
    res.render("verify-bulk", {
        title, root,
        logInType: req.session.user_type || "none",
        results: null,
        errorMessage: null
    });
}

// Process Bulk Verification CSV
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

        const csvContent = req.file.buffer.toString('utf-8');
        const records = parse(csvContent, {
            columns: true,
            skip_empty_lines: true,
            trim: true
        });

        let results = [];
        let allAttributes = ["universityName", "major", "departmentName", "cgpa"];

        for (let record of records) {
            let rollNumber = record.rollNumber || record.roll_number;

            if (!rollNumber) {
                results.push({ rollNumber: 'N/A', status: 'failed', message: 'Missing Roll Number in CSV row' });
                continue;
            }

            try {
                let cert = await certificates.findOne({ "rollNumber": rollNumber.trim() });

                if (!cert) {
                    results.push({ rollNumber: rollNumber, status: 'failed', message: 'Certificate not found' });
                    continue;
                }

                if (cert.revoked) {
                    results.push({ rollNumber: rollNumber, status: 'failed', message: 'REVOKED: ' + (cert.revokedReason || 'No reason') });
                    continue;
                }

                if (cert.expiryDate && new Date(cert.expiryDate) < new Date()) {
                    results.push({ rollNumber: rollNumber, status: 'failed', message: 'EXPIRED on ' + moment(cert.expiryDate).format('YYYY-MM-DD') });
                    continue;
                }

                // Verify on blockchain
                let disclosedData = {};
                allAttributes.forEach(attr => {
                    if (cert[attr]) disclosedData[attr] = cert[attr];
                });

                let mTreeProof = await encryption.generateCertificateProof(allAttributes, cert._id.toString(), cert.universityEmail);
                let proofIsCorrect = await encryption.verifyCertificateProof(mTreeProof, disclosedData, cert._id.toString());

                if (proofIsCorrect) {
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