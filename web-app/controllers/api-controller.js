let logger = require("../services/logger");
let encryption = require('../services/encryption');
let certificates = require('../database/models/certificates');
let QRCode = require('qrcode');



async function getGenerateProof(req, res, next) {

    try {

        if (!req.query.sharedAttributes || !Array.isArray(req.query.sharedAttributes) || req.query.sharedAttributes.length === 0) {
            throw Error("Choose atleast one attribute to share")
        }

        // Whitelist allowed attributes to prevent leaking internal fields
        const allowedAttributes = ["studentName", "universityName", "major", "departmentName", "cgpa", "dateOfIssuing", "expiryDate"];
        const filteredAttributes = req.query.sharedAttributes.filter(attr => allowedAttributes.includes(attr));

        if (filteredAttributes.length === 0) {
            throw Error("No valid attributes selected for sharing");
        }

        // Ownership check: Ensure the certificate belongs to the logged-in student
        const certUUID = String(req.query.certUUID);
        const cert = await certificates.findOne({ "_id": certUUID });
        if (!cert || cert.studentEmail !== req.session.email) {
            throw Error("Unauthorized: You do not own this certificate.");
        }

        let mTreeProof = await encryption.generateCertificateProof(filteredAttributes, certUUID, req.session.email);
        let disclosedData = await certificates.findOne({ "_id": certUUID }).select(filteredAttributes.join(" ") + " -_id");

        let proofObject = {
            proof: mTreeProof,
            disclosedData: disclosedData,
            certUUID: certUUID
        };

        // Generate QR code as base64 data URL
        let proofJSON = JSON.stringify(proofObject);
        let proofBase64 = Buffer.from(proofJSON).toString('base64');

        // Build verification URL (relative — works on any host)
        let verifyURL = `/verify?proof=${proofBase64}`;

        let qrCodeDataURL = null;
        try {
            qrCodeDataURL = await QRCode.toDataURL(verifyURL, {
                width: 300,
                margin: 2,
                color: { dark: '#000000', light: '#ffffff' }
            });
        } catch (qrErr) {
            logger.error("QR code generation failed: " + qrErr.message);
            // If URL is too long for QR, generate a simpler one
            // Fall back to just the certificate UUID
            let simplifiedURL = `/verify?certUUID=${certUUID}`;
            qrCodeDataURL = await QRCode.toDataURL(simplifiedURL, {
                width: 300,
                margin: 2,
                color: { dark: '#000000', light: '#ffffff' }
            });
        }

        res.status(200).send({
            proof: mTreeProof,
            disclosedData: disclosedData,
            certUUID: certUUID,
            qrCode: qrCodeDataURL,
            verifyURL: verifyURL
        });
    } catch (e) {
        logger.error(e);
        next(e);
    }
}


async function postVerifyCert(req, res, next) {
    try {
        const { certificateId, rollNumber } = req.body;

        if (!certificateId && !rollNumber) {
            return res.status(400).json({ success: false, error: "Provide certificateId or rollNumber" });
        }

        let query = {};
        if (certificateId) query._id = String(certificateId);
        if (rollNumber) query.rollNumber = String(rollNumber);

        const cert = await certificates.findOne(query);

        if (!cert) {
            return res.status(404).json({ success: false, error: "Certificate not found" });
        }

        if (cert.revoked) {
            return res.status(200).json({
                success: true,
                valid: false,
                status: "REVOKED",
                revocationReason: cert.revokedReason,
                revocationDate: cert.revokedAt
            });
        }

        return res.status(200).json({
            success: true,
            valid: true,
            status: "VALID",
            certificate: {
                id: cert._id,
                studentName: cert.studentName,
                university: cert.universityName,
                major: cert.major,
                department: cert.departmentName,
                cgpa: cert.cgpa,
                issueDate: cert.dateOfIssuing,
                expiryDate: cert.expiryDate || "Never",
                blockchainAssetId: "CERT" + cert._id
            }
        });

    } catch (e) {
        const errorMsg = req.app.get('env') === 'development' ? e.message : "Internal Server Error";
        return res.status(500).json({ success: false, error: errorMsg });
    }
}


async function apiErrorHandler(err, req, res, next) {
    const isDev = req.app.get('env') === 'development';

    // set locals, only providing error in development
    res.locals.message = err.message;
    res.locals.error = isDev ? err : {};

    const errorResponse = isDev ? err.message : "An unexpected error occurred. Please contact support.";

    // render the error page
    return res.status(err.status || 500).json({
        success: false,
        error: errorResponse
    });
}


module.exports = { getGenerateProof, postVerifyCert, apiErrorHandler };