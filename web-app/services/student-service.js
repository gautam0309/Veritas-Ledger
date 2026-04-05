/*
 * ============================================================================
 * FILE: web-app/services/student-service.js
 * ============================================================================
 * 
 * PURPOSE:
 *   Handles business logic specific to Students.
 *   Currently, students only need to view the certificates issued to them.
 * ============================================================================
 */

const certificates = require('../database/models/certificates');
const students = require('../database/models/students');
const chaincode = require('./fabric/chaincode');
const logger = require("./logger");
const encryption = require('./encryption');
const certificateService = require('./certificate-service');

/*
 * ===== FUNCTION: getCertificateDataforDashboard =====
 * WHAT: Loads the student dashboard. Fetches all certificates owned by this student.
 * 
 * HOW: Similar to the University version, it uses a two-phase query.
 *   1. Fetch the trusted index (list of UUIDs) from the blockchain.
 *   2. Fetch the display data (names, dates, graphics) from MongoDB.
 *   3. Merge them together so the UI has everything it needs.
 */
async function getCertificateDataforDashboard(studentPublicKey, studentEmail) {
    
    // 1. Fetch certificate UUIDs from Ledger using the student's Public Key.
    // isQuery = true (fast read, no consensus required)
    let certLedgerDataArray = await chaincode.invokeChaincode("getAllCertificateByStudent",
        [studentPublicKey], true, studentEmail);

    // 2. Map through the Fabric response to build an array of just the string UUIDs
    let certUUIDArray = certLedgerDataArray.map( element => {
        return element.certUUID
    });

    // 3. Search MongoDB for any certificate documents whose `_id` matches the array.
    // The `.exec()` turns the Mongoose query chain into an actual Promise we can await.
    let certDBRecords = await certificates.find().where('_id').in(certUUIDArray).exec();

    // 4. Send both lists to the helper service to glue the state together.
    return certificateService.mergeCertificateData(certDBRecords, certLedgerDataArray);
}

module.exports = {getCertificateDataforDashboard}
