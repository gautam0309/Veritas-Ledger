'use strict';


const { Contract } = require('fabric-contract-api');
const Certificate = require('./certificate');
const UniversityProfile = require('./university_profile');
const Schema = require('./schema');
const jsrs = require('jsrsasign');


class EducertContract extends Contract {

    
    async initLedger(ctx) {
        console.log("-------------------------initLedger Called---------------------------------------")

        let schemaCertificate = new Schema("university degree", "v1", ["universityName", "major", "departmentName", "cgpa", "certUUID"]);

        await ctx.stub.putState("schema_" + schemaCertificate.id, Buffer.from(JSON.stringify(schemaCertificate)));

        return schemaCertificate;
    }

    
    async issueCertificate(ctx, certHash, universitySignature, studentSignature, dateOfIssuing, certUUID, universityPK, studentPK) {
        console.log("============= START : Issue Certificate ===========");

        
        const mspId = ctx.clientIdentity.getMSPID();
        if (mspId !== 'Org1MSP') {
            throw new Error(`Unauthorized: Organization ${mspId} is not allowed to issue certificates.`);
        }

        
        const userEmail = ctx.clientIdentity.getAttributeValue('email');
        if (!userEmail) {
            throw new Error('Unauthorized: Client identity is missing the required email attribute.');
        }

        
        const exists = await ctx.stub.getState("CERT" + certUUID);
        if (exists && exists.length > 0) {
            throw new Error(`Certificate with UUID ${certUUID} already exists on the ledger.`);
        }

        
        
        const uniProfileAsBytes = await ctx.stub.getState("UNI_EMAIL_" + userEmail);
        if (!uniProfileAsBytes || uniProfileAsBytes.length === 0) {
            throw new Error(`Unauthorized: University profile for ${userEmail} not found. Please register first.`);
        }
        const uniProfile = JSON.parse(uniProfileAsBytes.toString());
        if (uniProfile.publicKey !== universityPK) {
            throw new Error(`Unauthorized: Provided Public Key does not match the registered key for ${userEmail}.`);
        }

        
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

    
    async revokeCertificate(ctx, certUUID, reason) {
        console.log("============= START : Revoke Certificate ===========");

        
        const mspId = ctx.clientIdentity.getMSPID();
        if (mspId !== 'Org1MSP') {
            throw new Error(`Unauthorized: Organization ${mspId} is not allowed to revoke certificates.`);
        }

        const certAsBytes = await ctx.stub.getState("CERT" + certUUID);
        if (!certAsBytes || certAsBytes.length === 0) {
            throw new Error(`Certificate with UUID ${certUUID} does not exist on the ledger.`);
        }

        const certificate = Certificate.deserialize(JSON.parse(certAsBytes.toString()));

        
        const userEmail = ctx.clientIdentity.getAttributeValue('email');
        console.log(`[REVOKE_DEBUG_V10] Revoking Cert ${certUUID}. User: ${userEmail}`);

        
        
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

        
        const txTimestamp = ctx.stub.getTxTimestamp();
        let tsSeconds = txTimestamp.seconds.low !== undefined ? txTimestamp.seconds.low : txTimestamp.seconds;
        if (typeof tsSeconds !== 'number') tsSeconds = Number(tsSeconds);

        certificate.revokedAt = new Date(tsSeconds * 1000).toISOString();

        await ctx.stub.putState("CERT" + certUUID, Buffer.from(JSON.stringify(certificate)));

        console.log("============= END : Revoke Certificate ===========");
        return certificate;
    }

    
    _verifySignature(publicKey, data, signature) {
        try {
            let sig = new jsrs.KJUR.crypto.Signature({ "alg": "SHA256withECDSA" });

            
            if (publicKey.includes('-----BEGIN PUBLIC KEY-----')) {
                sig.init(publicKey);
            } else {
                
                sig.init({ "xy": publicKey, "curve": "secp256r1" });
            }

            sig.updateHex(data);
            return sig.verify(signature);
        } catch (e) {
            console.log("Signature verification failed: " + e.message);
            return false;
        }
    }


    
    async registerUniversity(ctx, name, publicKey, location, description) {
        console.log("============= START : Register University ===========");

        
        const mspId = ctx.clientIdentity.getMSPID();
        if (mspId !== 'Org1MSP') {
            throw new Error('Unauthorized: Only Org1MSP admin can register new universities.');
        }

        const userEmail = ctx.clientIdentity.getAttributeValue('email');
        if (!userEmail) {
            throw new Error('Unauthorized: Client identity is missing the required email attribute.');
        }

        
        const exists = await ctx.stub.getState("UNI" + name);
        if (exists && exists.length > 0) {
            throw new Error(`University ${name} is already registered on the ledger.`);
        }

        
        const pkExists = await ctx.stub.getState("PK_" + publicKey);
        if (pkExists && pkExists.length > 0) {
            throw new Error(`Public Key ${publicKey} is already registered by another university.`);
        }

        const university = new UniversityProfile(name, publicKey, location, description, userEmail);
        await ctx.stub.putState("UNI" + name, Buffer.from(JSON.stringify(university)));

        
        await ctx.stub.putState("UNI_EMAIL_" + userEmail, Buffer.from(JSON.stringify(university)));
        await ctx.stub.putState("PK_" + publicKey, Buffer.from(name));

        console.log("============= END : Register University ===========");
        return university;
    }

    
    async queryUniversityProfileByName(ctx, name) {
        const profileAsBytes = await ctx.stub.getState("UNI" + name);

        if (!profileAsBytes || profileAsBytes.length === 0) {
            throw new Error(`University ${name} does not exist`);
        }

        console.log(`University ${name} Query Successful. Profile: `);
        console.log(profileAsBytes.toString());
        return JSON.parse(profileAsBytes.toString());
    }

    
    async queryCertificateSchema(ctx, schemaVersion) {
        let schemaAsBytes = await ctx.stub.getState("schema_" + schemaVersion);

        if (!schemaAsBytes || schemaAsBytes.length === 0) {
            if (schemaVersion === "v1") {
                let schemaCertificate = new Schema("university degree", "v1", ["universityName", "major", "departmentName", "cgpa", "certUUID"]);
                await ctx.stub.putState("schema_v1", Buffer.from(JSON.stringify(schemaCertificate)));
                return schemaCertificate;
            }
            throw new Error(`Schema ${schemaVersion} does not exist`);
        }

        console.log(`Schema ${schemaVersion} Query Successful. Schema: `);
        console.log(schemaAsBytes.toString());
        return JSON.parse(schemaAsBytes.toString());
    }

    
    async queryCertificateByUUID(ctx, UUID) {
        const certificateAsBytes = await ctx.stub.getState("CERT" + UUID);

        if (!certificateAsBytes || certificateAsBytes.length === 0) {
            throw new Error(`Certificate with UUID: ${UUID} does not exist`);
        }

        console.log(`Certificate ${UUID} Query Successful. Certificate Info: `);
        console.log(certificateAsBytes.toString());
        return JSON.parse(certificateAsBytes.toString());
    }

    
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
        let iterator = await ctx.stub.getQueryResult(JSON.stringify(queryString));

        while (true) {
            let res = await iterator.next();

            if (res.value && res.value.value.toString()) {
                try {
                    let jsonRes = JSON.parse(res.value.value.toString('utf8'));
                    let cert = Certificate.deserialize(jsonRes);

                    
                    certArray.push(cert);
                } catch (err) {
                    console.log("Failed to instantiate Certificate object from JSON\n" + err);
                    if (callerEmail === 'admin' || isUniversity) {
                        try {
                            let rawJson = JSON.parse(res.value.value.toString('utf8'));
                            certArray.push(rawJson);
                        } catch (e) {
                            certArray.push(res.value.value.toString('utf8'));
                        }
                    }
                }
            }

            if (res.done) {
                await iterator.close();
                break;
            }
        }

        return certArray;
    }

    
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
            
            
            
        }

        let certArray = [];
        let { results } = await this.queryWithQueryStringPaginated(ctx, JSON.stringify(queryString), 50, "");

        for (let i = 0; i < results.length; i++) {
            try {
                let cert = Certificate.deserialize(results[i].value);

                
                if (callerEmail === 'admin' ||
                    (callerEmail && cert.issuerEmail && callerEmail.replace(/\./g, '') === cert.issuerEmail.replace(/\./g, ''))) {
                    certArray.push(cert);
                } else if (!cert.issuerEmail && callerEmail === 'admin') {
                    
                    certArray.push(cert);
                }
            } catch (err) {
                console.log("Failed to instantiate Certificate object from JSON in getAllCertificateByUniversity\n" + err);
                console.log("DATA TYPE:  " + typeof results[i])
                
                if (callerEmail === 'admin') {
                    certArray.push(results[i]);
                }
            }
        }

        return certArray;
    }



    
    async queryAll(ctx) {
        
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



















































































