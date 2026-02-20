'use strict';

// Fabric smart contract class
const { Contract } = require('fabric-contract-api');
const Certificate = require('./certificate');
const UniversityProfile = require('./university_profile');
const Schema = require('./schema');
const jsrs = require('jsrsasign');


class EducertContract extends Contract {

    /**
     * Initialize the ledger. 
     * Certificate schema is written to database during initialization. Schema is necessary for encryption. 
     * @param {Context} ctx the transaction context.
     */
    async initLedger(ctx) {
        console.log("-------------------------initLedger Called---------------------------------------")

        let schemaCertificate = new Schema("university degree", "v1", ["universityName", "major", "departmentName", "cgpa", "certUUID"]);

        await ctx.stub.putState("schema_" + schemaCertificate.id, Buffer.from(JSON.stringify(schemaCertificate)));

        return schemaCertificate;
    }

    /**
     * Issue a new certificate to the ledger. 
     * @param {Context} ctx The transaction context
     * @param {String} certHash - Hash created from the certificate data. 
     * @param {String} universitySignature - Signature of @certHash signed by private key of issuer(university)
     * @param {String} studentSignature - Signature of @certHash signed by private key of holder(student)
     * @param {String} dateOfIssuing - Date the certificate was issued
     * @param {String} certUUID - UUID for a certificate (automatically generated. Must match with database entry)
     * @param {String} universityPK - Public key or public ID of issuer account
     * @param {String} studentPK - Public key or public ID of student account 
     */
    async issueCertificate(ctx, certHash, universitySignature, studentSignature, dateOfIssuing, certUUID, universityPK, studentPK) {
        console.log("============= START : Issue Certificate ===========");

        // 1. Access Control: Only identities from Org1 (University Org) can issue
        const mspId = ctx.clientIdentity.getMSPID();
        if (mspId !== 'Org1MSP') {
            throw new Error(`Unauthorized: Organization ${mspId} is not allowed to issue certificates.`);
        }

        // 2. ABAC: Get issuer email from identity attributes
        const userEmail = ctx.clientIdentity.getAttributeValue('email');
        if (!userEmail) {
            throw new Error('Unauthorized: Client identity is missing the required email attribute.');
        }

        // Check if certificate already exists to prevent overwrite
        const exists = await ctx.stub.getState("CERT" + certUUID);
        if (exists && exists.length > 0) {
            throw new Error(`Certificate with UUID ${certUUID} already exists on the ledger.`);
        }

        // 2.1 ABAC Verification: Ensure the caller's registered public key matches the provided universityPK
        // This prevents Category 2/9 Cross-University Issuance (using someone else's PK)
        const uniProfileAsBytes = await ctx.stub.getState("UNI_EMAIL_" + userEmail);
        if (!uniProfileAsBytes || uniProfileAsBytes.length === 0) {
            throw new Error(`Unauthorized: University profile for ${userEmail} not found. Please register first.`);
        }
        const uniProfile = JSON.parse(uniProfileAsBytes.toString());
        if (uniProfile.publicKey !== universityPK) {
            throw new Error(`Unauthorized: Provided Public Key does not match the registered key for ${userEmail}.`);
        }

        // 3. Signature Verification: Verify that the university actually signed this hash
        const isUniSigValid = this._verifySignature(universityPK, certHash, universitySignature);
        if (!isUniSigValid) {
            throw new Error('Invalid University Signature: The certificate hash does not match the provided signature.');
        }

        const isStudentSigValid = this._verifySignature(studentPK, certHash, studentSignature);
        if (!isStudentSigValid) {
            throw new Error('Invalid Student Signature: The certificate hash does not match the provided signature.');
        }

        const certificate = new Certificate(certHash, universitySignature, studentSignature, dateOfIssuing, certUUID, universityPK, studentPK, userEmail);
        await ctx.stub.putState("CERT" + certUUID, Buffer.from(JSON.stringify(certificate)));

        console.log("============= END : Issue Certificate ===========");
        return certificate;
    }

    /**
     * Revoke a certificate on the ledger.
     * @param {Context} ctx The transaction context
     * @param {String} certUUID - UUID of the certificate to revoke
     * @param {String} reason - Reason for revocation
     */
    async revokeCertificate(ctx, certUUID, reason) {
        console.log("============= START : Revoke Certificate ===========");

        // 1. Access Control: Only identities from Org1 (University Org) can revoke
        const mspId = ctx.clientIdentity.getMSPID();
        if (mspId !== 'Org1MSP') {
            throw new Error(`Unauthorized: Organization ${mspId} is not allowed to revoke certificates.`);
        }

        const certAsBytes = await ctx.stub.getState("CERT" + certUUID);
        if (!certAsBytes || certAsBytes.length === 0) {
            throw new Error(`Certificate with UUID ${certUUID} does not exist on the ledger.`);
        }

        const certificate = Certificate.deserialize(JSON.parse(certAsBytes.toString()));

        // 2. ABAC: Only the issuing university can revoke its own certificate
        const userEmail = ctx.clientIdentity.getAttributeValue('email');
        console.log(`[REVOKE_DEBUG_V10] Revoking Cert ${certUUID}. User: ${userEmail}`);

        // Strict check: fails ONLY if certificate has issuerEmail (New Certs) AND it doesn't match
        // We also check 'normalized' versions (removing dots) to handle potential formatting mismatches (e.g. gmail dots)
        if (certificate.issuerEmail) {
            console.log(`[REVOKE_DEBUG_V10] Cert Issuer: ${certificate.issuerEmail}`);
            const cleanIssuer = certificate.issuerEmail.replace(/\./g, '');
            const cleanUser = userEmail.replace(/\./g, '');
            console.log(`[REVOKE_DEBUG_V10] Clean Issuer: ${cleanIssuer}, Clean User: ${cleanUser}`);

            if (certificate.issuerEmail !== userEmail && cleanIssuer !== cleanUser) {
                console.log(`[REVOKE_DEBUG_V10] Authorization FAILED.`);
                throw new Error(`Unauthorized: You are not the issuer of this certificate. Issuer: ${certificate.issuerEmail}, You: ${userEmail}`);
            }
        } else {
            console.log(`[REVOKE_DEBUG_V10] Cert has NO issuerEmail (Legacy). Allowing revocation by Org1MSP.`);
        }

        certificate.revoked = true;
        certificate.revokedReason = reason;

        // Ensure timestamp conversion is safe for BigInt/Long objects
        const txTimestamp = ctx.stub.getTxTimestamp();
        let tsSeconds = txTimestamp.seconds.low !== undefined ? txTimestamp.seconds.low : txTimestamp.seconds;
        if (typeof tsSeconds !== 'number') tsSeconds = Number(tsSeconds);

        certificate.revokedAt = new Date(tsSeconds * 1000).toISOString();

        await ctx.stub.putState("CERT" + certUUID, Buffer.from(JSON.stringify(certificate)));

        console.log("============= END : Revoke Certificate ===========");
        return certificate;
    }

    /**
     * Internal helper to verify ECDSA signatures
     */
    _verifySignature(publicKey, data, signature) {
        try {
            let sig = new jsrs.KJUR.crypto.Signature({ "alg": "SHA256withECDSA" });

            // Check if publicKey is PEM or Hex
            if (publicKey.includes('-----BEGIN PUBLIC KEY-----')) {
                sig.init(publicKey);
            } else {
                // Assume PK is hex if not PEM
                sig.init({ "xy": publicKey, "curve": "secp256r1" });
            }

            sig.updateHex(data);
            return sig.verify(signature);
        } catch (e) {
            console.log("Signature verification failed: " + e.message);
            return false;
        }
    }


    /**
    * Register a university. Must be done when a university enrolls into the platform.
    * @param {Context} ctx The transaction context
    * @param {String} name 
    * @param {String} publicKey 
    * @param {String} location 
    * @param {String} description 
    */
    async registerUniversity(ctx, name, publicKey, location, description) {
        console.log("============= START : Register University ===========");

        // Access Control: Only Admin or certain roles should register universities
        const mspId = ctx.clientIdentity.getMSPID();
        if (mspId !== 'Org1MSP') {
            throw new Error('Unauthorized: Only Org1MSP admin can register new universities.');
        }

        const userEmail = ctx.clientIdentity.getAttributeValue('email');
        if (!userEmail) {
            throw new Error('Unauthorized: Client identity is missing the required email attribute.');
        }

        // Check if university already exists
        const exists = await ctx.stub.getState("UNI" + name);
        if (exists && exists.length > 0) {
            throw new Error(`University ${name} is already registered on the ledger.`);
        }

        // 3. Category 3 Fix: Prevent Public Key Collision
        const pkExists = await ctx.stub.getState("PK_" + publicKey);
        if (pkExists && pkExists.length > 0) {
            throw new Error(`Public Key ${publicKey} is already registered by another university.`);
        }

        const university = new UniversityProfile(name, publicKey, location, description, userEmail);
        await ctx.stub.putState("UNI" + name, Buffer.from(JSON.stringify(university)));

        // Store indexes for email and PK lookup (Category 2/9 optimization)
        await ctx.stub.putState("UNI_EMAIL_" + userEmail, Buffer.from(JSON.stringify(university)));
        await ctx.stub.putState("PK_" + publicKey, Buffer.from(name));

        console.log("============= END : Register University ===========");
        return university;
    }

    /**
     * Get public profile of a enrolled university based on it's name
     * @param {Context} ctx The transaction context
     * @param {String} name 
     * @returns {JSON} University Profile
     */
    async queryUniversityProfileByName(ctx, name) {
        const profileAsBytes = await ctx.stub.getState("UNI" + name);

        if (!profileAsBytes || profileAsBytes.length === 0) {
            throw new Error(`University ${name} does not exist`);
        }

        console.log(`University ${name} Query Successful. Profile: `);
        console.log(profileAsBytes.toString());
        return JSON.parse(profileAsBytes.toString());
    }

    /**
     * Get the certificate schema and ordering. 
     * @param {Context} ctx The transaction context
     * @param {String} schemaVersion Schema version number. Eg - "v1", "v2" etc
     */
    async queryCertificateSchema(ctx, schemaVersion) {
        let schemaAsBytes = await ctx.stub.getState("schema_" + schemaVersion);

        if (!schemaAsBytes || schemaAsBytes.length === 0) {
            throw new Error(`Schema ${schemaVersion} does not exist`);
        }

        console.log(`Schema ${schemaVersion} Query Successful. Schema: `);
        console.log(schemaAsBytes.toString());
        return JSON.parse(schemaAsBytes.toString());
    }

    /**
     * Get a certificate based on its UUID
     * @param {Context} ctx The transaction context
     * @param {String} UUID Certificate unique ID
     * @returns {JSON} Certificate data
     */
    async queryCertificateByUUID(ctx, UUID) {
        const certificateAsBytes = await ctx.stub.getState("CERT" + UUID);

        if (!certificateAsBytes || certificateAsBytes.length === 0) {
            throw new Error(`Certificate with UUID: ${UUID} does not exist`);
        }

        console.log(`Certificate ${UUID} Query Successful. Certificate Info: `);
        console.log(certificateAsBytes.toString());
        return JSON.parse(certificateAsBytes.toString());
    }

    /**
     * Returns all the certificates received by a specific student
     * @param {Context} ctx The transaction context
     * @param {*} studentPK Public Key of students account in platform
     * @returns {[Certificate]} 
     */
    async getAllCertificateByStudent(ctx, studentPK) {
        let queryString = {
            selector: {
                studentPK: studentPK,
                dataType: "certificate"
            }
        };

        const callerEmail = ctx.clientIdentity.getAttributeValue('email');
        let isUniversity = false;

        if (callerEmail) {
            let universityAsBytes = await ctx.stub.getState(callerEmail);
            if (universityAsBytes && universityAsBytes.length !== 0) {
                isUniversity = true;
            }
        }

        let certArray = [];
        let { results } = await this.queryWithQueryStringPaginated(ctx, JSON.stringify(queryString), 50, "");

        for (let i = 0; i < results.length; i++) {
            try {
                let cert = Certificate.deserialize(results[i].value);

                // ABAC Check: Only admin, a verified university, or the student themselves can view this history
                if (callerEmail === 'admin' || isUniversity ||
                    (callerEmail && cert.studentEmail && callerEmail.replace(/\./g, '') === cert.studentEmail.replace(/\./g, ''))) {
                    certArray.push(cert);
                }
            } catch (err) {
                console.log("Failed to instantiate Certificate object from JSON in getAllCertificateByStudent\n" + err);
                console.log("DATA TYPE:  " + typeof queryResults[i])
                // Only push raw if authorized as university or admin to prevent leakage of corrupted state to unauthorized users
                if (callerEmail === 'admin' || isUniversity) {
                    certArray.push(queryResults[i]);
                }
            }
        }

        return certArray;
    }

    /**
     * Returns al the certificates issued by a specific university
     * @param {Context} ctx The transaction context
     * @param {*} universityPK Public Key of university that issued the certificate
     * @returns {[Certificate]} 
     */
    async getAllCertificateByUniversity(ctx, universityPK) {
        let queryString = {
            selector: {
                universityPK: universityPK,
                dataType: "certificate"
            }
        };

        const callerEmail = ctx.clientIdentity.getAttributeValue('email');
        let isUniversity = false;

        if (callerEmail) {
            let universityAsBytes = await ctx.stub.getState("UNI" + callerEmail);
            // In the original getAllCertificateByStudent, it checked `callerEmail`, but standard is `UNI` + name for state keys.
            // Let's implement the core ABAC check based on the caller email matching the university's email
            // But we actually only have universityPK as the input.
        }

        let certArray = [];
        let { results } = await this.queryWithQueryStringPaginated(ctx, JSON.stringify(queryString), 50, "");

        for (let i = 0; i < results.length; i++) {
            try {
                let cert = Certificate.deserialize(results[i].value);

                // ABAC Check: Only admin or the issuing university can view this history
                if (callerEmail === 'admin' ||
                    (callerEmail && cert.issuerEmail && callerEmail.replace(/\./g, '') === cert.issuerEmail.replace(/\./g, ''))) {
                    certArray.push(cert);
                } else if (!cert.issuerEmail && callerEmail === 'admin') {
                    // Legacy certificates without issuerEmail: only admins can view them in bulk
                    certArray.push(cert);
                }
            } catch (err) {
                console.log("Failed to instantiate Certificate object from JSON in getAllCertificateByUniversity\n" + err);
                console.log("DATA TYPE:  " + typeof results[i])
                // Only push raw if authorized as admin
                if (callerEmail === 'admin') {
                    certArray.push(results[i]);
                }
            }
        }

        return certArray;
    }



    /**
     * Query and return all key value pairs in the world state.
     *
     * @param {Context} ctx the transaction context
     * @returns - all key-value pairs in the world state
    */
    async queryAll(ctx) {
        // Category 9 Fix: Restrict queryAll to admins only
        const mspId = ctx.clientIdentity.getMSPID();
        const userEmail = ctx.clientIdentity.getAttributeValue('email');
        if (mspId !== 'Org1MSP' || userEmail !== 'admin') {
            throw new Error('Unauthorized: Only Org1MSP admin can query all data.');
        }

        let queryString = {
            selector: {}
        };

        let queryResults = await this.queryWithQueryString(ctx, JSON.stringify(queryString));
        return queryResults;
    }

    /**
       * Evaluate a queryString and return all key-value pairs that match that query. 
       * Only possible if CouchDB is used as state database. 
       * @param {Context} ctx the transaction context
       * @param {String} queryString the query string to be evaluated
       * @param {Number} pageSize maximum number of results to return
       * @param {String} bookmark bookmark for the next page
       * @returns {Object} {results: [JSON], bookmark: String, count: Number}
      */
    async queryWithQueryStringPaginated(ctx, queryString, pageSize, bookmark) {

        console.log("============= START : queryWithQueryStringPaginated ===========");
        console.log(`Query: ${queryString}, PageSize: ${pageSize}, Bookmark: ${bookmark}`);

        let { iterator, metadata } = await ctx.stub.getQueryResultWithPagination(queryString, pageSize, bookmark);

        let allResults = [];

        while (true) {
            let res = await iterator.next();

            if (res.value && res.value.value.toString()) {
                let jsonRes = {};
                jsonRes.key = res.value.key;

                try {
                    jsonRes.value = JSON.parse(res.value.value.toString('utf8'));
                } catch (err) {
                    jsonRes.value = res.value.value.toString('utf8');
                }

                allResults.push(jsonRes);
            }
            if (res.done) {
                await iterator.close();
                return {
                    results: allResults,
                    bookmark: metadata.bookmark,
                    count: metadata.fetchedRecordsCount
                };
            }
        }
    }

    /**
       * Evaluate a queryString and return all key-value pairs that match that query. 
       * (Non-paginated - use for small internal lookups)
       * @param {Context} ctx the transaction context
       * @param {String} queryString the query string to be evaluated
       * @returns {[JSON]} - Two objects, key and value. 
      */
    async queryWithQueryString(ctx, queryString) {
        let resultsIterator = await ctx.stub.getQueryResult(queryString);
        let allResults = [];
        while (true) {
            let res = await resultsIterator.next();
            if (res.value && res.value.value.toString()) {
                let jsonRes = { key: res.value.key };
                try {
                    jsonRes.value = JSON.parse(res.value.value.toString('utf8'));
                } catch (err) {
                    jsonRes.value = res.value.value.toString('utf8');
                }
                allResults.push(jsonRes);
            }
            if (res.done) {
                await resultsIterator.close();
                return allResults;
            }
        }
    }

}




module.exports = EducertContract;