let logger = require("../services/logger");
let encryption = require('../services/encryption');
let certificates = require('../database/models/certificates');
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
        proofObject = JSON.parse(proofObject);

        if (!proofObject.disclosedData || Object.keys(proofObject.disclosedData).length === 0) {
            throw new Error("No parameter given. Provide parameters that need to be verified");
        }
        let proofIsCorrect = await encryption.verifyCertificateProof(proofObject.proof, proofObject.disclosedData, proofObject.certUUID);

        if (proofIsCorrect) {
            let certificateDbObject = await certificates.findOne({ "_id": proofObject.certUUID }).select("studentName studentEmail rollNumber _id dateOfIssuing universityName universityEmail");

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
 * Looks up the certificate in MongoDB by roll number, then verifies it exists on the blockchain.
 */
async function postVerifyByRollNumber(req, res, next) {
    try {
        let rollNumber = req.body.rollNumber;

        if (!rollNumber || rollNumber.trim().length === 0) {
            throw new Error("Please provide a valid Roll Number.");
        }

        // Look up certificate in database by roll number
        let certificateDbObject = await certificates.findOne({ "rollNumber": rollNumber.trim() });

        if (!certificateDbObject) {
            return res.render("verify-fail", {
                title, root,
                logInType: req.session.user_type || "none",
                message: "No certificate found for Roll Number: " + rollNumber
            });
        }

        // Verify the certificate exists on blockchain by generating and verifying a proof
        // We verify all available fields for full verification
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