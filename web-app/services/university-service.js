const universities = require('../database/models/universities');
const certificates = require('../database/models/certificates');
const students = require('../database/models/students');
const chaincode = require('./fabric/chaincode');
const logger = require("./logger");
const encryption = require('./encryption');
const certificateService = require('./certificate-service');


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
        
        
        logger.error(`CRITICAL SYNC GAP [Category 5]: Certificate ${certDBModel._id} COMMITTED TO LEDGER but FAILED TO SAVE TO DATABASE: ${dbError.message}`);
        
        
        throw new Error(`On-Chain Issuance SUCCESSFUL, but Local Database Sync FAILED. UUID: ${certDBModel._id}. Please contact admin for reconciliation.`);
    }

    return { success: true, certId: certDBModel._id.toString() };
}


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



async function revokeCertificateOnChain(certUUID, reason, universityEmail) {
    logger.info(`Revoking certificate ${certUUID} on-chain for ${universityEmail}`);
    await chaincode.invokeChaincode("revokeCertificate", [certUUID, reason], false, universityEmail);
}

module.exports = { issueCertificate, getCertificateDataforDashboard, revokeCertificateOnChain };





























































































