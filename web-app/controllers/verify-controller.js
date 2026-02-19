let logger = require("../services/logger");
let encryption = require('../services/encryption');
let certificates = require('../database/models/certificates');
let AuditLog = require('../database/models/auditlog');
let moment = require('moment');
let QRCode = require('qrcode');

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

            res.render("verify-success", {
                title, root,
                logInType: req.session.user_type || "none",
                certData: certificateDbObject,
                proofData: proofObject.disclosedData,
                verificationType: "proof"
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

            res.render("verify-success", {
                title, root,
                logInType: req.session.user_type || "none",
                certData: certificateDbObject,
                proofData: disclosedData,
                verificationType: "rollnumber"
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

module.exports = { postVerify, postVerifyByRollNumber };