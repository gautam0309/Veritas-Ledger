let logger = require("../services/logger");
let encryption = require('../services/encryption');
let certificates = require('../database/models/certificates');
let QRCode = require('qrcode');



async function getGenerateProof(req, res, next) {

    try {

        if (!req.query.sharedAttributes || req.query.sharedAttributes.length === 0) {
            throw Error("Choose atleast one attribute to share")
        }

        let mTreeProof = await encryption.generateCertificateProof(req.query.sharedAttributes, req.query.certUUID, req.session.email);
        let disclosedData = await certificates.findOne({ "_id": req.query.certUUID }).select(req.query.sharedAttributes.join(" ") + " -_id");

        let proofObject = {
            proof: mTreeProof,
            disclosedData: disclosedData,
            certUUID: req.query.certUUID
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
            let simplifiedURL = `/verify?certUUID=${req.query.certUUID}`;
            qrCodeDataURL = await QRCode.toDataURL(simplifiedURL, {
                width: 300,
                margin: 2,
                color: { dark: '#000000', light: '#ffffff' }
            });
        }

        res.status(200).send({
            proof: mTreeProof,
            disclosedData: disclosedData,
            certUUID: req.query.certUUID,
            qrCode: qrCodeDataURL,
            verifyURL: verifyURL
        });
    } catch (e) {
        logger.error(e);
        next(e);
    }
}


async function apiErrorHandler(err, req, res, next) {

    // set locals, only providing error in development
    res.locals.message = err.message;
    res.locals.error = req.app.get('env') === 'development' ? err : {};

    // render the error page
    return res.status(err.status || 500).send(JSON.stringify(err.message, undefined, 4));
}


module.exports = { getGenerateProof, apiErrorHandler };