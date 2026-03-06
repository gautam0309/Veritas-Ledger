require('dotenv').config();
require('./loaders/config');
const mongoose = require('./database/mongoose');
const certificates = require('./database/models/certificates');
const students = require('./database/models/students');
const universityService = require('./services/university-service');
require('./loaders/fabric-loader');
const chaincode = require('./services/fabric/chaincode');

async function run() {
    try {
        let certData = {
            rollNumber: "2301201182", // Target student Ira Malhotra
            studentEmail: "2301201182@krmu.edu.in",
            studentName: "Ira Malhotra",
            universityName: "KRMU",
            universityEmail: "admin@krmu.edu.in",
            major: "IT",
            departmentName: "CSE",
            cgpa: "9",
            dateOfIssuing: new Date().toISOString()
        };

        console.log("Issuing cert...");
        let response = await universityService.issueCertificate(certData);
        console.log("Service response:", response);

        console.log("Querying Ledger for student...");
        let student = await students.findOne({ email: certData.studentEmail });
        let allCertsStr = await chaincode.invokeChaincode('getAllCertificateByStudent', [student.publicKey], true, 'admin');
        let allCerts = typeof allCertsStr === 'string' ? JSON.parse(allCertsStr) : allCertsStr;
        console.log("Is array:", Array.isArray(allCerts), "Length:", allCerts ? allCerts.length : 0);

    } catch (e) {
        console.error("Test Error:", e.message);
    }
    process.exit(0);
}

setTimeout(run, 3000);
