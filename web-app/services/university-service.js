const universities = require('../database/models/universities');
const certificates = require('../database/models/certificates');
const students = require('../database/models/students');
const chaincode = require('./fabric/chaincode');
const logger = require("./logger");
const encryption = require('./encryption');
const certificateService = require('./certificate-service');

/**
 * Create certificate object in database and ledger.
 * For ledger - data needs to be cryptographically signed by student and university private key.
 * @param {certificates.schema} certData
 * @returns {Promise<{}>}
 */
async function issueCertificate(certData) {

    let universityObj = await universities.findOne({ "email": certData.universityEmail });
    let studentObj = await students.findOne({ "email": certData.studentEmail });

    if (!studentObj) throw new Error("Could not fetch student profile. Provide valid student email.");
    if (!universityObj) throw new Error("Could not fetch university profile.");

    let certDBModel = new certificates(certData);

    let mTreeHash = await encryption.generateMerkleRoot(certDBModel);
    let universitySignature = await encryption.createDigitalSignature(mTreeHash, certData.universityEmail);
    let studentSignature = await encryption.createDigitalSignature(mTreeHash, certData.studentEmail);

    let chaincodeResult = await chaincode.invokeChaincode("issueCertificate",
        [mTreeHash, universitySignature, studentSignature, certData.dateOfIssuing, certDBModel._id.toString(), universityObj.publicKey, studentObj.publicKey], false, certData.universityEmail);

    logger.debug(chaincodeResult);

    try {
        let res = await certDBModel.save();
        if (!res) throw new Error("Database returned empty result on save");
    } catch (dbError) {
        // Category 5 Fix: Critical Sync Gap Handling
        // The ledger transaction succeeded (invokeChaincode didn't throw), but DB save failed.
        logger.error(`CRITICAL SYNC GAP [Category 5]: Certificate ${certDBModel._id} COMMITTED TO LEDGER but FAILED TO SAVE TO DATABASE: ${dbError.message}`);
        // In a real production system, this would trigger an alert/queue for reconciliation.
        // For now, we return a partial success but throw so the controller knows about the DB error.
        throw new Error(`On-Chain Issuance SUCCESSFUL, but Local Database Sync FAILED. UUID: ${certDBModel._id}. Please contact admin for reconciliation.`);
    }

    return { success: true, certId: certDBModel._id.toString() };
}

/**
 * Fetch and return all certificates issued by a specific university
 * @param {String} universityName
 * @param {String} universtiyEmail
 * @returns {Promise<certificates[]>}
 */
async function getCertificateDataforDashboard(universityName, universtiyEmail) {
    let universityProfile = await chaincode.invokeChaincode("queryUniversityProfileByName",
        [universityName], true, universtiyEmail);

    let certLedgerDataArray = await chaincode.invokeChaincode("getAllCertificateByUniversity",
        [universityProfile.publicKey], true, universtiyEmail);

    let certUUIDArray = certLedgerDataArray.map(element => {
        return element.certUUID
    });

    let certDBRecords = await certificates.find().where('_id').in(certUUIDArray).exec();

    return certificateService.mergeCertificateData(certDBRecords, certLedgerDataArray);
}


/**
 * Revoke a certificate on-chain
 * @param {String} certUUID
 * @param {String} reason
 * @param {String} universityEmail
 * @returns {Promise<void>}
 */
async function revokeCertificateOnChain(certUUID, reason, universityEmail) {
    logger.info(`Revoking certificate ${certUUID} on-chain for ${universityEmail}`);
    await chaincode.invokeChaincode("revokeCertificate", [certUUID, reason], false, universityEmail);
}

module.exports = { issueCertificate, getCertificateDataforDashboard, revokeCertificateOnChain };
/* minor update: 2026-02-21 13:51:02 */

/* minor update: 2026-02-21 18:42:53 */

/* minor update: 2026-02-22 13:30:10 */

/* minor update: 2026-02-22 18:37:05 */

/* minor update: 2026-02-23 16:54:17 */

/* minor update: 2026-02-23 16:58:40 */

/* minor update: 2026-02-23 17:07:07 */

/* minor update: 2026-02-23 09:58:21 */

/* minor update: 2026-02-23 09:54:12 */

/* minor update: 2026-02-23 13:26:16 */

/* minor update: 2026-02-23 09:59:14 */

/* minor update: 2026-02-25 13:34:20 */

/* minor update: 2026-02-25 13:54:41 */

/* minor update: 2026-02-25 18:01:37 */

/* minor update: 2026-02-25 12:00:09 */

/* minor update: 2026-02-25 15:44:46 */

/* minor update: 2026-02-26 10:09:56 */

/* minor update: 2026-02-27 15:29:27 */

/* minor update: 2026-03-01 17:08:39 */

/* minor update: 2026-03-01 14:49:35 */

/* minor update: 2026-03-01 13:29:23 */

/* minor update: 2026-03-01 14:20:28 */

/* minor update: 2026-03-01 09:53:42 */

/* minor update: 2026-03-01 17:09:07 */

/* minor update: 2026-03-01 09:31:20 */

/* minor update: 2026-03-01 16:53:58 */

/* minor update: 2026-03-02 17:05:54 */

/* minor update: 2026-03-02 11:49:47 */
