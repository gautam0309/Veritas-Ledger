/*
 * ============================================================================
 * FILE: web-app/services/certificate-service.js
 * ============================================================================
 * 
 * PURPOSE:
 *   A helper service to reconcile data from two different sources.
 *   The web application uses a Hybrid Architecture:
 *     - MongoDB (Off-chain): Stores PII (names, emails) and display data (major, CGPA)
 *     - Fabric (On-chain): Stores the cryptographic proofs, trust states, and revocation flags.
 *
 *   This file takes the lists from both sources and zips them together into
 *   a single, unified JSON array that the frontend UI can happily render.
 * ============================================================================
 */


const moment = require('moment');


/**
 * Merge certificate data from Database and Blockchain Ledger
 * @param {certificates[]} dbRecordArray
 * @param ledgerRecordArray
 * @returns {certificates[]}
 */

/*
 * ===== FUNCTION: mergeCertificateData =====
 * WHAT: Iterates through the MongoDB results, finds the matching Blockchain record
 *   by UUID, and combines the fields into a new object.
 */
function mergeCertificateData(dbRecordArray, ledgerRecordArray) {
    let certMergedDataArray = [];

    // Loop over every record returned by MongoDB
    for (let i = 0; i < dbRecordArray.length; i++) {
        let dbEntry = dbRecordArray[i];

        // Search the array returned from Fabric for a matching UUID
        let chaincodeEntry = ledgerRecordArray.find((element) => {
            // MongoDB `_id` is an ObjectId, so we must call .toString()
            return element.certUUID === dbEntry._id.toString();
        });

        // If something exists in the DB but NOT on the ledger, it's considered unverified/fraudulent, so we skip it.
        // This is a core feature of the system's security.
        if (!chaincodeEntry) continue; // skip if no matching ledger entry

        // UI Enhancement: Calculate if the certificate has expired
        let isExpired = false;
        if (dbEntry.expiryDate) {
            isExpired = new Date(dbEntry.expiryDate) < new Date();
        }

        // Build the combined object
        certMergedDataArray.push({
            // ---> Data sourced from MongoDB <---
            studentName: dbEntry.studentName,
            studentEmail: dbEntry.studentEmail,
            universityName: dbEntry.universityName,
            universityEmail: dbEntry.universityEmail,
            cgpa: dbEntry.cgpa,
            departmentName: dbEntry.departmentName,
            dateOfIssuing: moment(dbEntry.dateOfIssuing).format('YYYY-MM-DD'),
            major: dbEntry.major,
            rollNumber: dbEntry.rollNumber || 'N/A',
            certUUID: dbEntry._id.toString(),
            
            // ---> Data sourced from the Fabric Ledger <---
            hash: chaincodeEntry.certHash,
            
            // ---> New fields for extended functionality <---
            revoked: dbEntry.revoked || false,
            revokedReason: dbEntry.revokedReason || '',
            revokedAt: dbEntry.revokedAt ? moment(dbEntry.revokedAt).format('YYYY-MM-DD') : null,
            expiryDate: dbEntry.expiryDate ? moment(dbEntry.expiryDate).format('YYYY-MM-DD') : null,
            expired: isExpired,
            certificateImage: dbEntry.certificateImage || null
        })
    }

    return certMergedDataArray;
}

module.exports = { mergeCertificateData };