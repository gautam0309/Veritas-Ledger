
const certificates = require('../database/models/certificates');
const students = require('../database/models/students');
const chaincode = require('./fabric/chaincode');
const logger = require("./logger");
const encryption = require('./encryption');
const certificateService = require('./certificate-service');




async function getCertificateDataforDashboard(studentPublicKey, studentEmail) {


    let certLedgerDataArray = await chaincode.invokeChaincode("getAllCertificateByStudent",
        [studentPublicKey], true, studentEmail);

    let certUUIDArray = certLedgerDataArray.map( element => {
        return element.certUUID
    });

    let certDBRecords = await certificates.find().where('_id').in(certUUIDArray).exec();

    return certificateService.mergeCertificateData(certDBRecords, certLedgerDataArray);
}


module.exports = {getCertificateDataforDashboard}
/* minor update: 2026-02-21 17:22:41 */

/* minor update: 2026-02-21 09:28:16 */

/* minor update: 2026-02-21 12:23:04 */

/* minor update: 2026-02-21 16:34:52 */

/* minor update: 2026-02-21 17:37:34 */

/* minor update: 2026-02-21 17:19:41 */

/* minor update: 2026-02-21 09:03:44 */

/* minor update: 2026-02-22 09:21:08 */

/* minor update: 2026-02-22 14:54:36 */

/* minor update: 2026-02-23 11:32:52 */

/* minor update: 2026-02-23 18:06:06 */

/* minor update: 2026-02-23 14:19:36 */

/* minor update: 2026-02-23 10:04:18 */

/* minor update: 2026-02-23 11:12:49 */

/* minor update: 2026-02-23 11:59:21 */

/* minor update: 2026-02-23 18:38:24 */

/* minor update: 2026-02-23 09:19:33 */

/* minor update: 2026-02-23 12:12:37 */

/* minor update: 2026-02-25 16:58:25 */

/* minor update: 2026-02-25 14:51:28 */

/* minor update: 2026-02-25 14:30:13 */

/* minor update: 2026-02-25 14:37:22 */

/* minor update: 2026-02-25 12:44:24 */

/* minor update: 2026-02-25 13:56:34 */

/* minor update: 2026-02-25 17:07:11 */

/* minor update: 2026-03-01 12:26:15 */

/* minor update: 2026-03-01 14:22:28 */

/* minor update: 2026-03-02 16:44:51 */

/* minor update: 2026-03-02 13:32:56 */

/* minor update: 2026-03-02 12:51:28 */

/* minor update: 2026-03-02 13:10:06 */

/* minor update: 2026-03-04 15:40:21 */

/* minor update: 2026-03-04 15:02:55 */

/* minor update: 2026-03-04 16:35:14 */

/* minor update: 2026-03-04 13:31:55 */
