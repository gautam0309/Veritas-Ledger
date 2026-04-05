/*
 * ============================================================================
 * FILE: web-app/services/university-service.js
 * ============================================================================
 * 
 * PURPOSE:
 *   Contains the core business logic for Universities.
 *   This service is the "glue" that connects the UI/Controllers, the Off-chain
 *   MongoDB database, and the On-chain Hyperledger Fabric ledger.
 *
 * KEY FUNCTIONS:
 *   - issueCertificate: Saves to DB, creates hashes, and writes to Blockchain
 *   - getCertificateDataforDashboard: Fetches and merges on-chain and off-chain data
 *   - revokeCertificateOnChain: Updates the valid/revoked state on the ledger
 * ============================================================================
 */


const universities = require('../database/models/universities');
const certificates = require('../database/models/certificates');
const students = require('../database/models/students');

// WHAT: The Fabric SDK Gateway wrapper to execute chaincode
const chaincode = require('./fabric/chaincode');
const logger = require("./logger");

// WHAT: The custom cryptography helper (AES encryption, digital signatures, hashing)
const encryption = require('./encryption');

// WHAT: Helper to merge MongoDB records with Fabric ledger states
const certificateService = require('./certificate-service');

/**
 * Create certificate object in database and ledger.
 * For ledger - data needs to be cryptographically signed by student and university private key.
 * @param {certificates.schema} certData
 * @returns {Promise<{}>}
 */

/*
 * ===== FUNCTION: issueCertificate =====
 * WHAT: The most complex and vital function in the system. It issues a new
 *   certificate by saving the bulk data to MongoDB, hashing it, and saving
 *   the trusted hash + signatures to the blockchain.
 * 
 * CONCEPT — Hybrid Storage Architecture:
 *   If we stored the entire certificate (names, grades, pictures) on the
 *   blockchain, it would be slow, expensive, and violate GDPR (because blockchain
 *   data cannot be deleted). Instead, we store the data in MongoDB, take a "fingerprint"
 *   (hash) of that data, and store ONLY the fingerprint on the blockchain.
 */
async function issueCertificate(certData) {

    // 1. Verify existence of both parties in the local database
    let universityObj = await universities.findOne({ "email": certData.universityEmail });
    let studentObj = await students.findOne({ "email": certData.studentEmail });

    if (!studentObj) throw new Error("Could not fetch student profile. Provide valid student email.");
    if (!universityObj) throw new Error("Could not fetch university profile.");

    // 2. Prepare the Mongoose Model (assigns a unique _id automatically)
    let certDBModel = new certificates(certData);

    // 3. Cryptography Step 1: Hashing
    // WHAT: Take the entire certificate data and squish it into a Merkle Root Hash.
    // WHY: If anyone changes even one letter of the certificate in MongoDB later,
    //   re-hashing it will produce a completely different result, exposing the fraud.
    let mTreeHash = await encryption.generateMerkleRoot(certDBModel);

    // 4. Cryptography Step 2: Digital Signatures
    // WHAT: Both the University and the Student cryptographically sign the hash.
    // WHY: Proves that the University *actually issued* this exact certificate,
    //   and the Student *accepted* it. Non-repudiation.
    let universitySignature = await encryption.createDigitalSignature(mTreeHash, certData.universityEmail);
    let studentSignature = await encryption.createDigitalSignature(mTreeHash, certData.studentEmail);

    // 5. Blockchain Step: Write to Ledger
    let chaincodeResult = await chaincode.invokeChaincode("issueCertificate",
        [mTreeHash, universitySignature, studentSignature, certData.dateOfIssuing, certDBModel._id.toString(), universityObj.publicKey, studentObj.publicKey], false, certData.universityEmail);

    if (chaincodeResult && chaincodeResult.fabricOffline) {
        return { fabricOffline: true };
    }

    logger.debug(chaincodeResult);

    // 6. DB Step: Save the raw data
    try {
        let res = await certDBModel.save();
        if (!res) throw new Error("Database returned empty result on save");
    } catch (dbError) {
        // Category 5 Fix: Critical Sync Gap Handling
        // THE RISK: 
        //   Step 5 (Blockchain) succeeded, but Step 6 (MongoDB) failed.
        //   Now the blockchain says a certificate exists, but we have no data for it!
        // THE FIX: 
        //   Log it loudly as a CRITICAL SYNC GAP so admins can manually reconcile.
        //   In a production app, this would use a distributed transaction coordinator
        //   or a retry queue (like RabbitMQ) to guarantee eventual consistency.
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

/*
 * ===== FUNCTION: getCertificateDataforDashboard =====
 * WHAT: Loads the university dashboard, showing every certificate they have ever issued.
 * HOW: It runs a two-step query. First, gets the hashes from the ledger. Second,
 *   looks up the matching raw data in MongoDB using the UUIDs.
 */
async function getCertificateDataforDashboard(universityName, universtiyEmail) {
    // 1. Get the university's public key from the ledger Profile
    let universityProfile = await chaincode.invokeChaincode("queryUniversityProfileByName",
        [universityName], true, universtiyEmail);

    // Category 4 Fix: Handle Offline Fabric Circuit Breaker
    if (universityProfile && universityProfile.fabricOffline) {
        return { fabricOffline: true };
    }

    // 2. Fetch all certificate hashes owned by that public key from Fabric
    let certLedgerDataArray = await chaincode.invokeChaincode("getAllCertificateByUniversity",
        [universityProfile.publicKey], true, universtiyEmail);

    if (certLedgerDataArray && certLedgerDataArray.fabricOffline) {
        return { fabricOffline: true };
    }

    // Extract just the UUIDs into a simple array: ["uuid1", "uuid2"]
    let certUUIDArray = certLedgerDataArray.map(element => {
        return element.certUUID
    });

    // 3. One massive fetch from MongoDB using the `$in` operator
    let certDBRecords = await certificates.find().where('_id').in(certUUIDArray).exec();

    // 4. Merge the Blockchain state (valid/revoked) with the DB state (student name, major)
    return certificateService.mergeCertificateData(certDBRecords, certLedgerDataArray);
}


/*
 * ===== FUNCTION: revokeCertificateOnChain =====
 * WHAT: Marks a previously issued certificate as "Revoked" (invalid) on the blockchain.
 * WHY: If someone cheated, or there was a typo, the university can revoke it.
 *   This updates the state in Fabric so that if an employer tries to verify it,
 *   the system will flag it as revoked.
 */
/**
 * Revoke a certificate on-chain
 * @param {String} certUUID
 * @param {String} reason
 * @param {String} universityEmail
 * @returns {Promise<void>}
 */
async function revokeCertificateOnChain(certUUID, reason, universityEmail) {
    logger.info(`Revoking certificate ${certUUID} on-chain for ${universityEmail}`);
    // isQuery = false, because we are altering the state on the ledger.
    await chaincode.invokeChaincode("revokeCertificate", [certUUID, reason], false, universityEmail);
}

module.exports = { issueCertificate, getCertificateDataforDashboard, revokeCertificateOnChain };
