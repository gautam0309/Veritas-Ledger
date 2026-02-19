const moment = require('moment');


/**
 * Merge certificate data from Database and Blockchain Ledger
 * @param {certificates[]} dbRecordArray
 * @param ledgerRecordArray
 * @returns {certificates[]}
 */
function mergeCertificateData(dbRecordArray, ledgerRecordArray) {
    let certMergedDataArray = [];

    for (let i = 0; i < dbRecordArray.length; i++) {
        let dbEntry = dbRecordArray[i];
        let chaincodeEntry = ledgerRecordArray.find((element) => {
            return element.certUUID === dbEntry._id.toString();
        });

        let isExpired = false;
        if (dbEntry.expiryDate) {
            isExpired = new Date(dbEntry.expiryDate) < new Date();
        }

        certMergedDataArray.push({
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
            hash: chaincodeEntry.certHash,
            // New fields
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