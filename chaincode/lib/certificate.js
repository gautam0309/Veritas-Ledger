'use strict';


class Certificate {
    

    
    
    constructor(certHash, universitySignature, studentSignature, dateOfIssuing, certUUID, universityPK, studentPK, issuerEmail = "") {
        this.certHash = certHash;
        this.universityPK = universityPK;
        this.studentPK = studentPK;
        this.universitySignature = universitySignature;
        this.studentSignature = studentSignature;
        this.dateOfIssuing = dateOfIssuing;
        this.certUUID = certUUID;
        this.issuerEmail = issuerEmail;
        this.dataType = "certificate";
        this.revoked = false;
        this.revokedReason = "";
        this.revokedAt = "";
    }



    

    static deserialize(data) {
        const cert = new Certificate(data.certHash, data.universitySignature, data.studentSignature, data.dateOfIssuing, data.certUUID, data.universityPK, data.studentPK, data.issuerEmail);
        cert.revoked = data.revoked || false;
        cert.revokedReason = data.revokedReason || "";
        cert.revokedAt = data.revokedAt || "";
        return cert;
    }


    
}

module.exports = Certificate;