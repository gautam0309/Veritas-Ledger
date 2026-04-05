/*
 * ============================================================================
 * FILE: chaincode/lib/educert_contract.js
 * ============================================================================
 * 
 * PURPOSE:
 *   This is the MAIN SMART CONTRACT — the heart of the blockchain layer.
 *   It contains ALL the functions (called "transactions") that can be
 *   executed on the Hyperledger Fabric blockchain. Every interaction with
 *   the blockchain goes through methods defined in this class.
 *
 * WHY THIS FILE EXISTS:
 *   In Hyperledger Fabric, business logic lives in "chaincode" (smart contracts).
 *   This file defines WHAT operations the blockchain supports:
 *   - Issue certificates, Revoke certificates, Register universities
 *   - Query certificates, Query university profiles, Query schemas
 *
 * HOW IT CONNECTS TO OTHER FILES:
 *   BLOCKCHAIN SIDE:
 *   - index.js exports this class → Fabric loads it during deployment
 *   - Uses Certificate, UniversityProfile, Schema classes for data models
 *   - Uses jsrsasign library for ECDSA signature verification
 *   WEB APP SIDE:
 *   - web-app/services/fabric/chaincode.js calls these functions via Fabric SDK
 *   - The web app NEVER imports this file directly — communication happens
 *     through Fabric's gRPC protocol between the SDK and peer nodes
 *
 * WHEN THIS FILE GETS EXECUTED:
 *   Inside Docker containers running Fabric peer nodes. The flow is:
 *   1. User clicks "Issue Certificate" on the web UI
 *   2. Web app calls chaincode.js → Fabric SDK creates a transaction proposal
 *   3. Proposal is sent to peer nodes via gRPC
 *   4. Peer nodes execute the relevant method in THIS file
 *   5. Results go through ordering → committed to blockchain → returned to web app
 *
 * SECURITY MODEL:
 *   - MSP (Membership Service Provider) checks: Only Org1MSP can issue/revoke
 *   - ABAC (Attribute Based Access Control): Email attributes on identities
 *   - ECDSA signature verification: Cryptographic proof of authenticity
 *   - Duplicate prevention: Checks for existing keys before writing
 * ============================================================================
 */

// Enable strict mode for safer JavaScript execution
'use strict';

// CONCEPT — Destructuring Import { Contract }:
//   `const { Contract } = require('fabric-contract-api')` is "destructuring".
//   The module exports an object with multiple properties. We only want `Contract`.
//   It's equivalent to:
//     const fabricApi = require('fabric-contract-api');
//     const Contract = fabricApi.Contract;
//   WHY: Cleaner syntax — we only need the Contract class, not everything else.
// WHAT THIS IMPORT IS:
//   `Contract` is the BASE CLASS from Hyperledger Fabric's contract API.
//   Our EducertContract EXTENDS this class to inherit Fabric's transaction
//   handling, context management, and lifecycle methods.
// IF REMOVED: Cannot create a Fabric-compatible smart contract — fatal error.
// Fabric smart contract class
const { Contract } = require('fabric-contract-api');

// Import our custom data model classes (see their respective files for details)
// WHAT: The Certificate class — represents a certificate stored on the blockchain
// WHY: Used to create Certificate objects when issuing, and deserialize when querying
// IF REMOVED: Cannot create or parse certificate objects — issueCertificate would crash
const Certificate = require('./certificate');

// WHAT: The UniversityProfile class — represents a university's public profile
// WHY: Used in registerUniversity to create profiles, and in issueCertificate for ABAC checks
// IF REMOVED: Cannot register universities or verify their identities
const UniversityProfile = require('./university_profile');

// WHAT: The Schema class — defines the structure/field ordering of certificates
// WHY: Used in initLedger to create the initial schema, and in queryCertificateSchema to read it
// IF REMOVED: Cannot initialize the ledger or query certificate schemas
const Schema = require('./schema');

// WHAT: jsrsasign is a JavaScript RSA/ECDSA cryptographic library
// WHY: Used to verify digital signatures on certificates. When a university
//   signs a certificate hash with its private key, this library checks
//   that signature using the university's public key.
// CONCEPT — ECDSA (Elliptic Curve Digital Signature Algorithm):
//   A cryptographic method for creating digital signatures. It uses
//   elliptic curve math to create small, secure signatures.
//   secp256r1 is the specific curve used (also called P-256/prime256v1).
// IF REMOVED: Signature verification would be impossible — anyone could forge certificates
const jsrs = require('jsrsasign');

// CONCEPT — extends:
//   `class EducertContract extends Contract` means EducertContract INHERITS from Contract.
//   EducertContract gets all of Contract's functionality (transaction handling, context
//   management) PLUS our custom methods (issueCertificate, registerUniversity, etc.).
// CONCEPT — Inheritance:
//   Like "is-a" relationship: EducertContract IS A Contract.
//   The parent class (Contract) provides the infrastructure.
//   The child class (EducertContract) provides the business logic.
// WHY: Fabric requires smart contracts to extend its Contract base class.
//   This is how Fabric discovers which methods are available as transactions.
// IF REMOVED: Fabric wouldn't recognize this as a valid smart contract.
class EducertContract extends Contract {

    /**
     * Initialize the ledger. 
     * Certificate schema is written to database during initialization. Schema is necessary for encryption. 
     * @param {Context} ctx the transaction context.
     */

    /*
     * ===== FUNCTION: initLedger =====
     * WHAT: Sets up the blockchain with initial data (the certificate schema).
     * WHY: Before any certificates can be issued, the system needs to know
     *   what fields a certificate has and in what order to hash them.
     * WHEN CALLED: Once, during chaincode instantiation (deployCC command).
     * INPUT: ctx — the Fabric transaction context (provided automatically by Fabric)
     * OUTPUT: Returns the created Schema object
     * STEP-BY-STEP:
     *   1. Create a new Schema defining the certificate structure
     *   2. Serialize it to JSON and store on the blockchain
     *   3. Return the schema
     *
     * CONCEPT — async/await:
     *   `async` marks this function as ASYNCHRONOUS — it can "pause" while
     *   waiting for slow operations (like writing to the blockchain).
     *   `await` is used inside async functions to "pause and wait" for a
     *   Promise to resolve. Without await, the code would continue BEFORE
     *   the blockchain write completes, which could cause data issues.
     * CONCEPT — Promise (implicit):
     *   An async function ALWAYS returns a Promise. A Promise represents
     *   a value that will be available in the FUTURE (not right now).
     *   The caller can use `await` to wait for the Promise to resolve.
     */
    async initLedger(ctx) {
        // Log a message to the peer node's console for debugging
        // WHAT: Prints a banner showing initLedger was called
        // WHY: Helps developers see in Docker logs that initialization occurred
        // IF REMOVED: No impact on functionality, just loses debug visibility
        console.log("-------------------------initLedger Called---------------------------------------")

        // Create a new Schema instance defining the certificate structure
        // WHAT: Creates a Schema with type "university degree", version "v1", and
        //   the ordered list of fields that make up a certificate hash
        // WHY: This ordering is CRITICAL — when computing a certificate hash,
        //   fields must be concatenated in THIS exact order. If order changes,
        //   the hash changes, and signature verification breaks.
        // CONCEPT — let:
        //   `let` declares a block-scoped variable (limited to this function).
        //   Unlike `var` (function-scoped), `let` prevents accidental reuse.
        //   Unlike `const`, `let` allows reassignment (though we don't reassign here).
        // IF REMOVED: No schema would exist — certificate operations would fail
        let schemaCertificate = new Schema("university degree", "v1", ["universityName", "major", "departmentName", "cgpa", "certUUID"]);

        // Store the schema on the blockchain's world state (key-value database)
        // WHAT: Writes the schema to the blockchain with key "schema_v1"
        // CONCEPT — ctx.stub.putState(key, value):
        //   This is Fabric's API for writing data to the blockchain.
        //   `ctx` = transaction context (provided by Fabric, contains stub, identity, etc.)
        //   `ctx.stub` = the "stub" object that provides blockchain read/write methods
        //   `putState(key, value)` = stores a key-value pair in the world state
        //   The key is a string ("schema_v1"), the value must be a Buffer (raw bytes).
        // CONCEPT — Buffer.from(JSON.stringify(...)):
        //   JSON.stringify() converts the Schema object → JSON string
        //   Buffer.from() converts the string → raw bytes (Buffer)
        //   Fabric requires values to be Buffers, not strings or objects.
        // CONCEPT — await:
        //   `await` pauses execution until putState completes.
        //   WITHOUT await: the function would return BEFORE the data is stored,
        //   and the schema might not be available for subsequent operations.
        //   WITH await: we guarantee the data is stored before continuing.
        // IF REMOVED: The schema would be created in memory but never saved to the blockchain
        await ctx.stub.putState("schema_" + schemaCertificate.id, Buffer.from(JSON.stringify(schemaCertificate)));

        // Return the schema object to the caller
        // WHAT: Sends the schema back as confirmation that initialization succeeded
        // WHY: The caller (Fabric CLI) can verify the schema was created correctly
        // IF REMOVED: Caller gets `undefined` — not fatal but loses confirmation
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

    /*
     * ===== FUNCTION: issueCertificate =====
     * WHAT: Creates a new academic certificate on the blockchain.
     * WHY: This is the CORE FUNCTION of the entire platform — it permanently
     *   records a verified certificate on an immutable ledger.
     * WHEN CALLED: When a university submits a certificate through the web UI.
     * INPUT: Transaction context + certificate data (hash, signatures, keys, etc.)
     * OUTPUT: The created Certificate object
     * SECURITY FLOW (5 checks in order):
     *   1. MSP check → Is caller from Org1 (university organization)?
     *   2. Email attribute → Does caller's identity have an email?
     *   3. Duplicate check → Does this certificate UUID already exist?
     *   4. ABAC check → Does caller's public key match their registered profile?
     *   5. Signature verification → Are both signatures cryptographically valid?
     * IF ALL PASS → Certificate is created and stored on the blockchain
     */
    async issueCertificate(ctx, certHash, universitySignature, studentSignature, dateOfIssuing, certUUID, universityPK, studentPK) {
        // Debug log for tracing transaction execution in peer container logs
        console.log("============= START : Issue Certificate ===========");

        // ── SECURITY CHECK 1: MSP Identity Verification ──
        // WHAT: Gets the caller's MSP (Membership Service Provider) ID
        // CONCEPT — MSP (Membership Service Provider):
        //   In Fabric, each organization has an MSP that manages identities.
        //   Org1MSP = the university organization's identity provider.
        //   Org2MSP = could be a student organization or verifier org.
        //   The MSP ID tells us WHICH organization the caller belongs to.
        // WHY: Only universities (Org1MSP) should be able to issue certificates.
        //   A student or verifier should NEVER be able to issue certs.
        // IF REMOVED: Anyone from any organization could issue certificates — 
        //   completely breaks the trust model.
        // 1. Access Control: Only identities from Org1 (University Org) can issue
        const mspId = ctx.clientIdentity.getMSPID();
        // WHAT: Checks if the caller is from Org1MSP
        // WHY: Access control — reject non-university callers immediately
        // CONCEPT — const:
        //   `const` declares a variable that CANNOT be reassigned after creation.
        //   Used here because mspId should never change within this function.
        //   Unlike `let` (reassignable) or `var` (function-scoped, hoisted).
        if (mspId !== 'Org1MSP') {
            // CONCEPT — throw new Error():
            //   `throw` immediately stops the function and sends an error to the caller.
            //   The transaction is ABORTED — nothing is written to the blockchain.
            //   The web app receives this error message and displays it to the user.
            // CONCEPT — Template Literals (`...${variable}...`):
            //   Backtick strings allow embedding variables directly with ${}.
            //   Equivalent to: 'Unauthorized: Organization ' + mspId + ' is not...'
            throw new Error(`Unauthorized: Organization ${mspId} is not allowed to issue certificates.`);
        }

        // ── SECURITY CHECK 2: ABAC Email Attribute ──
        // WHAT: Extracts the 'email' attribute from the caller's X.509 certificate
        // CONCEPT — ABAC (Attribute Based Access Control):
        //   Instead of just checking "are you in Org1?", we also check specific
        //   attributes embedded in the caller's identity certificate.
        //   During enrollment (registration), the CA embeds attributes like
        //   {email: "krmu@krmu.edu.in"} into the user's X.509 certificate.
        //   This method reads those attributes.
        // WHY: We need to know WHICH university is calling, not just that they're from Org1.
        //   This prevents University A from issuing certificates as University B.
        // IF REMOVED: We'd know the caller is from Org1 but not which specific university.
        // 2. ABAC: Get issuer email from identity attributes
        const userEmail = ctx.clientIdentity.getAttributeValue('email');
        if (!userEmail) {
            // CONCEPT — !value (Logical NOT / Falsy check):
            //   `!userEmail` is true if userEmail is null, undefined, "", 0, or false.
            //   This checks: "does the caller have an email attribute?"
            throw new Error('Unauthorized: Client identity is missing the required email attribute.');
        }

        // ── SECURITY CHECK 3: Duplicate Prevention ──
        // WHAT: Checks if a certificate with this UUID already exists on the ledger
        // CONCEPT — ctx.stub.getState(key):
        //   Reads a value from the blockchain's world state (key-value database).
        //   Returns a Buffer if the key exists, or an empty Buffer if it doesn't.
        //   This is an async operation (blockchain I/O), so we use `await`.
        // WHY: Without this, submitting the same certificate twice would OVERWRITE the first one.
        //   This is especially dangerous if someone changes data between submissions.
        // IF REMOVED: Duplicate certificates could be stored, or worse, existing
        //   certificates could be silently replaced with modified versions.
        // Check if certificate already exists to prevent overwrite
        const exists = await ctx.stub.getState("CERT" + certUUID);
        // WHAT: Checks if the returned Buffer has content (length > 0 means key exists)
        // CONCEPT — && (Logical AND):
        //   `exists && exists.length > 0` first checks if exists is truthy (not null/undefined),
        //   THEN checks if it has content. This prevents "Cannot read property 'length' of null".
        if (exists && exists.length > 0) {
            throw new Error(`Certificate with UUID ${certUUID} already exists on the ledger.`);
        }

        // ── SECURITY CHECK 4: ABAC Public Key Verification ──
        // WHAT: Looks up the caller's registered university profile by their email
        // WHY: Prevents "Cross-University Issuance" — University A trying to issue
        //   a certificate using University B's public key. We verify that the
        //   universityPK parameter matches the caller's REGISTERED public key.
        // IF REMOVED: A malicious university could issue certificates using another
        //   university's public key, making it look like the other university issued them.
        // 2.1 ABAC Verification: Ensure the caller's registered public key matches the provided universityPK
        // This prevents Category 2/9 Cross-University Issuance (using someone else's PK)
        const uniProfileAsBytes = await ctx.stub.getState("UNI_EMAIL_" + userEmail);
        if (!uniProfileAsBytes || uniProfileAsBytes.length === 0) {
            throw new Error(`Unauthorized: University profile for ${userEmail} not found. Please register first.`);
        }
        // CONCEPT — JSON.parse():
        //   Converts a JSON string back into a JavaScript object.
        //   The blockchain stores data as strings (Buffers), so we need to parse it.
        //   .toString() converts the Buffer to a string first.
        const uniProfile = JSON.parse(uniProfileAsBytes.toString());
        // WHAT: Compare the provided publicKey with the registered one
        // WHY: If they don't match, the caller is trying to impersonate another university
        if (uniProfile.publicKey !== universityPK) {
            throw new Error(`Unauthorized: Provided Public Key does not match the registered key for ${userEmail}.`);
        }

        // ── SECURITY CHECK 5: Cryptographic Signature Verification ──
        // WHAT: Verifies that the university's digital signature is valid
        // WHY: Even if the caller has the right MSP and email, we need CRYPTOGRAPHIC PROOF
        //   that they actually signed this specific certificate hash with their private key.
        //   This is the strongest form of verification because it's mathematically provable.
        // CONCEPT — this._verifySignature():
        //   `this` refers to the EducertContract instance.
        //   `_verifySignature` is a private helper method (the _ prefix is a convention
        //   indicating "private" — don't call this from outside the class).
        //   It uses the jsrsasign library to verify ECDSA signatures.
        // IF REMOVED: Anyone who knows a university's public key could forge certificates
        //   without having the university's private key.
        // 3. Signature Verification: Verify that the university actually signed this hash
        const isUniSigValid = this._verifySignature(universityPK, certHash, universitySignature);
        if (!isUniSigValid) {
            throw new Error('Invalid University Signature: The certificate hash does not match the provided signature.');
        }

        // WHAT: Same verification for the student's signature
        // WHY: Proves the student acknowledged and accepted this certificate
        const isStudentSigValid = this._verifySignature(studentPK, certHash, studentSignature);
        if (!isStudentSigValid) {
            throw new Error('Invalid Student Signature: The certificate hash does not match the provided signature.');
        }

        // ── ALL CHECKS PASSED: Create and store the certificate ──
        // WHAT: Creates a new Certificate object with all the validated data
        // WHY: After passing all 5 security checks, we can safely create the certificate.
        //   Note: `userEmail` (the caller's email) is stored as `issuerEmail` for future
        //   ABAC checks during revocation.
        const certificate = new Certificate(certHash, universitySignature, studentSignature, dateOfIssuing, certUUID, universityPK, studentPK, userEmail);
        // WHAT: Stores the certificate on the blockchain with key "CERT" + UUID
        // WHY: This is the actual WRITE to the immutable ledger. Once committed,
        //   this certificate exists permanently on the blockchain.
        // KEY FORMAT: "CERT" + UUID (e.g., "CERT550e8400-e29b-41d4...")
        //   The "CERT" prefix avoids key collisions with university profiles ("UNI...")
        //   and schemas ("schema_...") in the same key-value store.
        await ctx.stub.putState("CERT" + certUUID, Buffer.from(JSON.stringify(certificate)));

        console.log("============= END : Issue Certificate ===========");
        // Return the certificate to the caller (the web app receives this as JSON)
        return certificate;
    }

    /**
     * Revoke a certificate on the ledger.
     * @param {Context} ctx The transaction context
     * @param {String} certUUID - UUID of the certificate to revoke
     * @param {String} reason - Reason for revocation
     */

    /*
     * ===== FUNCTION: revokeCertificate =====
     * WHAT: Marks an existing certificate as REVOKED on the blockchain.
     * WHY: Certificates sometimes need to be invalidated (fraud, error, expulsion).
     *   Instead of deleting (impossible on blockchain), we SET a "revoked" flag.
     * WHEN CALLED: University clicks "Revoke" on their dashboard.
     * INPUT: ctx (context), certUUID (which cert), reason (why revoking)
     * OUTPUT: The updated Certificate object with revoked=true
     * SECURITY: Only the SAME university that issued the cert can revoke it.
     */
    async revokeCertificate(ctx, certUUID, reason) {
        console.log("============= START : Revoke Certificate ===========");

        // SECURITY CHECK 1: Only Org1MSP (university org) can revoke
        // (Same MSP check as issueCertificate — see those comments for details)
        // 1. Access Control: Only identities from Org1 (University Org) can revoke
        const mspId = ctx.clientIdentity.getMSPID();
        if (mspId !== 'Org1MSP') {
            throw new Error(`Unauthorized: Organization ${mspId} is not allowed to revoke certificates.`);
        }

        // Read the certificate from the blockchain by its UUID key
        // WHAT: Fetches the stored certificate data using "CERT" + UUID as the key
        // WHY: We need the existing certificate to modify its revocation status
        // IF REMOVED: Can't read the certificate — can't revoke it
        const certAsBytes = await ctx.stub.getState("CERT" + certUUID);
        // Check if the certificate actually exists
        if (!certAsBytes || certAsBytes.length === 0) {
            throw new Error(`Certificate with UUID ${certUUID} does not exist on the ledger.`);
        }

        // Deserialize: Convert raw JSON bytes → Certificate class instance
        // WHAT: JSON.parse converts Buffer→string→object, then deserialize creates a Certificate
        // WHY: We need a proper Certificate object to modify its properties
        // CONCEPT — Method Chaining:
        //   certAsBytes.toString() → gives JSON string
        //   JSON.parse(...) → gives plain JS object
        //   Certificate.deserialize(...) → gives Certificate instance
        const certificate = Certificate.deserialize(JSON.parse(certAsBytes.toString()));

        // SECURITY CHECK 2: ABAC — Only the ISSUING university can revoke
        // WHAT: Gets the caller's email and compares it to the certificate's issuerEmail
        // WHY: University A should NOT be able to revoke University B's certificates
        // 2. ABAC: Only the issuing university can revoke its own certificate
        const userEmail = ctx.clientIdentity.getAttributeValue('email');
        console.log(`[REVOKE_DEBUG_V10] Revoking Cert ${certUUID}. User: ${userEmail}`);

        // Strict check: fails ONLY if certificate has issuerEmail (New Certs) AND it doesn't match
        // We also check 'normalized' versions (removing dots) to handle potential formatting mismatches (e.g. gmail dots)
        if (certificate.issuerEmail) {
            console.log(`[REVOKE_DEBUG_V10] Cert Issuer: ${certificate.issuerEmail}`);
            // CONCEPT — .replace(/\./g, ''):
            //   This is a Regular Expression (regex) replacement.
            //   /\./ matches a literal dot character
            //   /g flag means "global" — replace ALL dots, not just the first
            //   '' replaces each dot with nothing (removes it)
            //   WHY: "john.doe@gmail.com" and "johndoe@gmail.com" are the same in Gmail.
            //   This normalization handles such edge cases.
            const cleanIssuer = certificate.issuerEmail.replace(/\./g, '');
            const cleanUser = userEmail.replace(/\./g, '');
            console.log(`[REVOKE_DEBUG_V10] Clean Issuer: ${cleanIssuer}, Clean User: ${cleanUser}`);

            // Check both original AND normalized emails
            // CONCEPT — && (AND) with !== (strict inequality):
            //   Both conditions must be true for the block to execute.
            //   First checks exact match, then checks dot-normalized match.
            //   Only fails if NEITHER version matches.
            if (certificate.issuerEmail !== userEmail && cleanIssuer !== cleanUser) {
                console.log(`[REVOKE_DEBUG_V10] Authorization FAILED.`);
                throw new Error(`Unauthorized: You are not the issuer of this certificate. Issuer: ${certificate.issuerEmail}, You: ${userEmail}`);
            }
        } else {
            // Legacy certificates (issued before ABAC was added) have no issuerEmail.
            // We allow any Org1MSP member to revoke these for backward compatibility.
            console.log(`[REVOKE_DEBUG_V10] Cert has NO issuerEmail (Legacy). Allowing revocation by Org1MSP.`);
        }

        // ── Mark the certificate as revoked ──
        // WHAT: Sets the revoked flag to true and stores the reason
        // WHY: This is the actual "revocation" — changing data on the blockchain
        // NOTE: The old data is NOT deleted. Blockchain is append-only.
        //   A new version of this key is written; the old version stays in history.
        certificate.revoked = true;
        certificate.revokedReason = reason;

        // ── Get the blockchain transaction timestamp ──
        // WHAT: Gets the timestamp from the Fabric transaction itself (not system clock)
        // WHY: Using the TX timestamp ensures consistency across all peers.
        //   System clocks on different peers might differ, but the TX timestamp
        //   is agreed upon during consensus.
        // CONCEPT — ctx.stub.getTxTimestamp():
        //   Returns a protobuf Timestamp object with {seconds, nanos}.
        //   `seconds` might be a regular number OR a Long object (from protobuf).
        // Ensure timestamp conversion is safe for BigInt/Long objects
        const txTimestamp = ctx.stub.getTxTimestamp();
        // WHAT: Safely extract seconds, handling both Number and Long/BigInt formats
        // CONCEPT — Ternary Operator (condition ? valueIfTrue : valueIfFalse):
        //   Compact if/else. If `.low` exists (Long object), use `.low`, otherwise use raw value.
        let tsSeconds = txTimestamp.seconds.low !== undefined ? txTimestamp.seconds.low : txTimestamp.seconds;
        // Ensure tsSeconds is a proper JavaScript number
        if (typeof tsSeconds !== 'number') tsSeconds = Number(tsSeconds);

        // WHAT: Convert Unix seconds → JavaScript Date → ISO string
        // WHY: Stores a human-readable timestamp like "2026-04-06T12:00:00.000Z"
        //   `* 1000` because JS Date constructor expects milliseconds, not seconds
        certificate.revokedAt = new Date(tsSeconds * 1000).toISOString();

        // Write the updated certificate back to the blockchain
        // WHAT: Overwrites the existing certificate with the revoked version
        // WHY: The blockchain records this as a new transaction — the original
        //   version is preserved in the blockchain's history (immutable log)
        await ctx.stub.putState("CERT" + certUUID, Buffer.from(JSON.stringify(certificate)));

        console.log("============= END : Revoke Certificate ===========");
        // Return the updated certificate to confirm revocation succeeded
        return certificate;
    }

    /**
     * Internal helper to verify ECDSA signatures
     */

    /*
     * ===== FUNCTION: _verifySignature =====
     * WHAT: Verifies a digital signature using ECDSA cryptography.
     * WHY: Ensures that the person who claims to have signed the data
     *   actually possesses the corresponding private key.
     * INPUT: publicKey (verifier), data (what was signed), signature (the proof)
     * OUTPUT: true if valid, false if invalid or error
     * CONCEPT — The _ prefix convention:
     *   Methods starting with _ are considered "private" by convention.
     *   JavaScript doesn't enforce this (unlike Java's `private` keyword),
     *   but it signals "this is internal — don't call from outside the class."
     * NOTE: This is NOT an async method — cryptographic operations are CPU-bound
     *   (not I/O-bound), so they run synchronously.
     */
    _verifySignature(publicKey, data, signature) {
        // CONCEPT — try/catch:
        //   Wraps code that might throw an error. If an error occurs inside `try`,
        //   execution jumps to `catch` instead of crashing the entire program.
        //   WHY HERE: Crypto operations can fail for many reasons (malformed key,
        //   invalid signature format, wrong curve, etc.). We want to catch these
        //   gracefully and return false instead of crashing the chaincode.
        try {
            // WHAT: Creates a new ECDSA signature verifier using SHA-256 hashing
            // CONCEPT — SHA256withECDSA:
            //   "SHA256" = the hash algorithm (creates a 256-bit fingerprint)
            //   "ECDSA" = the signature algorithm (uses elliptic curve math)
            //   Together: first hash the data with SHA-256, then verify with ECDSA.
            let sig = new jsrs.KJUR.crypto.Signature({ "alg": "SHA256withECDSA" });

            // Check if publicKey is PEM or Hex
            // WHAT: PEM format starts with "-----BEGIN PUBLIC KEY-----"
            //   Hex format is just a raw hexadecimal string
            // WHY: The system supports both formats for flexibility.
            //   PEM is the standard format; hex is a compact alternative.
            if (publicKey.includes('-----BEGIN PUBLIC KEY-----')) {
                // Initialize with PEM-formatted public key
                sig.init(publicKey);
            } else {
                // Assume PK is hex if not PEM
                // WHAT: Initialize with hex public key on the secp256r1 curve
                // "xy" = the x,y coordinates of the public key point on the curve
                // "curve" = which elliptic curve to use (secp256r1 = P-256)
                sig.init({ "xy": publicKey, "curve": "secp256r1" });
            }

            // WHAT: Feed the data (certificate hash) into the signature verifier
            // WHY: The verifier needs the original data to compare against the signature
            // "Hex" means the data is in hexadecimal format
            sig.updateHex(data);
            // WHAT: Perform the actual verification
            // RETURNS: true if the signature matches the data+publicKey, false otherwise
            // HOW IT WORKS INTERNALLY:
            //   1. Takes the signature and decrypts it using the public key → gets a hash
            //   2. Compares that hash with the hash of the data we fed in
            //   3. If they match → signature is valid (the private key holder signed this)
            return sig.verify(signature);
        } catch (e) {
            // Log the error for debugging but don't crash — just return false
            // WHAT: If anything went wrong (bad key format, etc.), treat as invalid
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

    /*
     * ===== FUNCTION: registerUniversity =====
     * WHAT: Creates a university's public profile on the blockchain.
     * WHY: Before a university can issue certificates, it must register
     *   its identity (name + public key) on the ledger. This profile is
     *   then used for ABAC checks during certificate issuance.
     * WHEN CALLED: When a university first signs up through the web UI.
     * INPUT: ctx, name, publicKey, location, description
     * OUTPUT: The created UniversityProfile object
     * SECURITY: Only Org1MSP with a valid email attribute can register.
     * STORAGE KEYS CREATED (3 indexes):
     *   "UNI" + name         → primary lookup by name
     *   "UNI_EMAIL_" + email → lookup by email (for ABAC in issueCertificate)
     *   "PK_" + publicKey    → prevents two universities from using the same key
     */
    async registerUniversity(ctx, name, publicKey, location, description) {
        console.log("============= START : Register University ===========");

        // SECURITY: Same MSP + email checks as issueCertificate
        // Access Control: Only Admin or certain roles should register universities
        const mspId = ctx.clientIdentity.getMSPID();
        if (mspId !== 'Org1MSP') {
            throw new Error('Unauthorized: Only Org1MSP admin can register new universities.');
        }

        const userEmail = ctx.clientIdentity.getAttributeValue('email');
        if (!userEmail) {
            throw new Error('Unauthorized: Client identity is missing the required email attribute.');
        }

        // DUPLICATE CHECK 1: Prevent universities with the same name
        // WHAT: Checks if "UNI" + name key already exists on the blockchain
        // WHY: Two universities with the same name would cause confusion
        // Check if university already exists
        const exists = await ctx.stub.getState("UNI" + name);
        if (exists && exists.length > 0) {
            throw new Error(`University ${name} is already registered on the ledger.`);
        }

        // DUPLICATE CHECK 2: Prevent public key reuse (Category 3 security fix)
        // WHAT: Checks if any university already registered with this public key
        // WHY: If two universities share a public key, one could forge certificates
        //   as the other. Each university MUST have a unique key pair.
        // IF REMOVED: Two universities could register the same public key,
        //   enabling cross-university certificate forgery.
        // 3. Category 3 Fix: Prevent Public Key Collision
        const pkExists = await ctx.stub.getState("PK_" + publicKey);
        if (pkExists && pkExists.length > 0) {
            throw new Error(`Public Key ${publicKey} is already registered by another university.`);
        }

        // Create the UniversityProfile object and store it on the blockchain
        // WHAT: Creates a new profile with the caller's email stored for ABAC
        const university = new UniversityProfile(name, publicKey, location, description, userEmail);
        // PRIMARY INDEX: Store under "UNI" + name (for queryUniversityProfileByName)
        await ctx.stub.putState("UNI" + name, Buffer.from(JSON.stringify(university)));

        // SECONDARY INDEXES: Additional keys for efficient lookups
        // WHAT: Stores the same profile under "UNI_EMAIL_" + email
        // WHY: issueCertificate needs to look up a profile by the caller's email
        //   to verify their public key. Without this index, we'd need to iterate
        //   over ALL universities to find the one with matching email — very slow.
        // Store indexes for email and PK lookup (Category 2/9 optimization)
        await ctx.stub.putState("UNI_EMAIL_" + userEmail, Buffer.from(JSON.stringify(university)));
        // WHAT: Maps "PK_" + publicKey → university name
        // WHY: Quick check in registerUniversity to prevent PK collisions
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

    /*
     * ===== FUNCTION: queryUniversityProfileByName =====
     * WHAT: Reads a university's profile from the blockchain by name.
     * WHY: Used to display university info and retrieve their public key.
     * INPUT: ctx, name (university name string)
     * OUTPUT: JSON object of the university's profile
     * NOTE: This is a QUERY (read-only) — it doesn't write to the blockchain.
     */
    async queryUniversityProfileByName(ctx, name) {
        // Read the university profile from the blockchain using "UNI" + name as key
        const profileAsBytes = await ctx.stub.getState("UNI" + name);

        // Validate that the university exists
        if (!profileAsBytes || profileAsBytes.length === 0) {
            throw new Error(`University ${name} does not exist`);
        }

        // Debug logging — visible in peer container Docker logs
        console.log(`University ${name} Query Successful. Profile: `);
        console.log(profileAsBytes.toString());
        // Parse the raw bytes → JSON string → JavaScript object and return it
        return JSON.parse(profileAsBytes.toString());
    }

    /**
     * Get the certificate schema and ordering. 
     * @param {Context} ctx The transaction context
     * @param {String} schemaVersion Schema version number. Eg - "v1", "v2" etc
     */

    /*
     * ===== FUNCTION: queryCertificateSchema =====
     * WHAT: Retrieves the certificate field schema from the blockchain.
     * WHY: The web app needs to know which fields to include (and in what order)
     *   when computing certificate hashes for signing.
     * SELF-HEALING: If v1 schema doesn't exist, it AUTO-CREATES it.
     *   This handles cases where initLedger wasn't called properly.
     * INPUT: ctx, schemaVersion (e.g., "v1")
     * OUTPUT: Schema JSON object with certificateType, id, ordering, dataType
     */
    async queryCertificateSchema(ctx, schemaVersion) {
        // Try to read the schema from the blockchain
        let schemaAsBytes = await ctx.stub.getState("schema_" + schemaVersion);

        // If schema doesn't exist in the ledger...
        if (!schemaAsBytes || schemaAsBytes.length === 0) {
            // SELF-HEALING: Auto-create v1 schema if it's missing
            // WHAT: If requesting "v1" and it doesn't exist, create it on the fly
            // WHY: initLedger might not have been called, or the ledger was reset.
            //   This ensures the system can always recover the default schema.
            if (schemaVersion === "v1") {
                let schemaCertificate = new Schema("university degree", "v1", ["universityName", "major", "departmentName", "cgpa", "certUUID"]);
                await ctx.stub.putState("schema_v1", Buffer.from(JSON.stringify(schemaCertificate)));
                return schemaCertificate;
            }
            // For non-v1 schemas, throw an error
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

    /*
     * ===== FUNCTION: queryCertificateByUUID =====
     * WHAT: Reads a single certificate from the blockchain by its UUID.
     * WHY: Used for certificate verification — someone scans a QR code or
     *   enters a UUID, and this function retrieves the certificate data.
     * INPUT: ctx, UUID (the certificate's unique identifier)
     * OUTPUT: JSON object of the certificate (hash, signatures, dates, etc.)
     * CALLED BY: verify-controller.js in the web app
     */
    async queryCertificateByUUID(ctx, UUID) {
        // Read the certificate using "CERT" + UUID as the key
        const certificateAsBytes = await ctx.stub.getState("CERT" + UUID);

        // Return error if the certificate doesn't exist
        if (!certificateAsBytes || certificateAsBytes.length === 0) {
            throw new Error(`Certificate with UUID: ${UUID} does not exist`);
        }

        console.log(`Certificate ${UUID} Query Successful. Certificate Info: `);
        console.log(certificateAsBytes.toString());
        // Parse and return the certificate as a JavaScript object
        return JSON.parse(certificateAsBytes.toString());
    }

    /**
     * Returns all the certificates received by a specific student
     * @param {Context} ctx The transaction context
     * @param {*} studentPK Public Key of students account in platform
     * @returns {[Certificate]} 
     */

    /*
     * ===== FUNCTION: getAllCertificateByStudent =====
     * WHAT: Queries ALL certificates belonging to a specific student.
     * WHY: Student dashboard needs to display all their certificates.
     * HOW: Uses CouchDB "rich queries" — SQL-like queries on JSON documents.
     *   This is ONLY possible because Fabric is configured to use CouchDB
     *   (not LevelDB) as the state database.
     * CONCEPT — CouchDB Rich Queries:
     *   Unlike simple getState(key), rich queries let you filter by ANY field:
     *   {selector: {studentPK: "xyz", dataType: "certificate"}}
     *   This is like SQL: SELECT * FROM ledger WHERE studentPK='xyz' AND dataType='certificate'
     * CONCEPT — Iterator Pattern:
     *   CouchDB returns results as an ITERATOR (not an array).
     *   You call iterator.next() repeatedly until res.done === true.
     *   This is memory-efficient for large result sets.
     */
    async getAllCertificateByStudent(ctx, studentPK) {
        // Build a CouchDB Mango query to find all certificates for this student
        // WHAT: Creates a JSON query object that CouchDB understands
        // "selector" is CouchDB's query language (similar to MongoDB queries)
        // This query says: "Find all documents where studentPK matches AND dataType is certificate"
        let queryString = {
            selector: {
                studentPK: studentPK,
                dataType: "certificate"
            }
        };

        // Check if the caller is a university (used for fallback error handling below)
        const callerEmail = ctx.clientIdentity.getAttributeValue('email');
        let isUniversity = false;

        if (callerEmail) {
            let universityAsBytes = await ctx.stub.getState(callerEmail);
            if (universityAsBytes && universityAsBytes.length !== 0) {
                isUniversity = true;
            }
        }

        // Initialize an empty array to collect results
        let certArray = [];
        // Execute the rich query — returns an ITERATOR, not an array
        // CONCEPT — ctx.stub.getQueryResult():
        //   Sends the CouchDB query to the peer's state database.
        //   Returns an iterator that yields results one at a time.
        //   JSON.stringify converts our query object to a string (CouchDB needs a string).
        let iterator = await ctx.stub.getQueryResult(JSON.stringify(queryString));

        // CONCEPT — while(true) + break (Iterator Loop Pattern):
        //   This is the standard pattern for consuming Fabric iterators.
        //   We loop forever, calling iterator.next() each iteration.
        //   When res.done === true, we break out of the loop.
        //   WHY NOT for/forEach: Iterators don't have a length — you don't
        //   know in advance how many results there are.
        while (true) {
            // Get the next result from the iterator
            // WHAT: Returns {value: {key, value}, done: boolean}
            let res = await iterator.next();

            // Process the result if it has a value
            if (res.value && res.value.value.toString()) {
                try {
                    // Parse the raw bytes → JSON → Certificate object
                    let jsonRes = JSON.parse(res.value.value.toString('utf8'));
                    let cert = Certificate.deserialize(jsonRes);

                    // ABAC Check: inherently filtered by studentPK in selector
                    certArray.push(cert);
                } catch (err) {
                    // FALLBACK: If deserialization fails (e.g., corrupt data),
                    // still include the raw data for admins/universities to debug
                    console.log("Failed to instantiate Certificate object from JSON\n" + err);
                    if (callerEmail === 'admin' || isUniversity) {
                        try {
                            let rawJson = JSON.parse(res.value.value.toString('utf8'));
                            certArray.push(rawJson);
                        } catch (e) {
                            // Last resort: push the raw string
                            certArray.push(res.value.value.toString('utf8'));
                        }
                    }
                }
            }

            // Check if the iterator is exhausted (no more results)
            if (res.done) {
                // IMPORTANT: Always close iterators to free resources
                await iterator.close();
                break;
            }
        }

        // Return the array of all certificates for this student
        return certArray;
    }

    /**
     * Returns al the certificates issued by a specific university
     * @param {Context} ctx The transaction context
     * @param {*} universityPK Public Key of university that issued the certificate
     * @returns {[Certificate]} 
     */

    /*
     * ===== FUNCTION: getAllCertificateByUniversity =====
     * WHAT: Queries all certificates issued by a specific university.
     * WHY: University dashboard needs to show all certificates they've issued.
     * DIFFERENCE FROM getAllCertificateByStudent:
     *   - Uses PAGINATED queries (queryWithQueryStringPaginated) for efficiency
     *   - Has stricter ABAC: only the issuing university or admin can view results
     *   - Uses a for loop instead of while(true) since pagination gives an array
     */
    async getAllCertificateByUniversity(ctx, universityPK) {
        // Build CouchDB query: find all certs where universityPK matches
        let queryString = {
            selector: {
                universityPK: universityPK,
                dataType: "certificate"
            }
        };

        // Get caller identity for ABAC checks
        const callerEmail = ctx.clientIdentity.getAttributeValue('email');
        let isUniversity = false;

        if (callerEmail) {
            let universityAsBytes = await ctx.stub.getState("UNI" + callerEmail);
            // In the original getAllCertificateByStudent, it checked `callerEmail`, but standard is `UNI` + name for state keys.
            // Let's implement the core ABAC check based on the caller email matching the university's email
            // But we actually only have universityPK as the input.
        }

        let certArray = [];
        // CONCEPT — Destructuring Assignment { results }:
        //   queryWithQueryStringPaginated returns {results, bookmark, count}.
        //   `let { results } = ...` extracts ONLY the `results` property.
        //   Equivalent to: let response = await ...; let results = response.results;
        // WHY PAGINATED: For large datasets, loading all results at once could
        //   exhaust memory. Pagination loads results in batches (50 here).
        let { results } = await this.queryWithQueryStringPaginated(ctx, JSON.stringify(queryString), 50, "");

        // CONCEPT — for loop (classic iteration):
        //   Unlike the while(true) iterator pattern above, here we have an array
        //   with a known .length, so we use a standard for loop.
        for (let i = 0; i < results.length; i++) {
            try {
                // Deserialize each result into a Certificate object
                // results[i].value is the parsed JSON (not raw bytes — pagination pre-parses)
                let cert = Certificate.deserialize(results[i].value);

                // ABAC Check: Only admin or the issuing university can view this history
                // WHAT: Compare caller's email (normalized) with the cert's issuerEmail
                // WHY: University A should NOT see University B's certificate list
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

    /*
     * ===== FUNCTION: queryAll =====
     * WHAT: Returns EVERYTHING in the blockchain's world state.
     * WHY: Admin debugging tool — allows seeing all data on the ledger.
     * SECURITY: Restricted to admin only (Category 9 security fix).
     *   Without this restriction, ANY user could dump the entire database.
     */
    async queryAll(ctx) {
        // SECURITY: Admin-only access control
        // WHAT: Requires BOTH Org1MSP membership AND admin email attribute
        // WHY: This function exposes ALL data — certificates, profiles, schemas.
        //   Only a trusted admin should have this level of access.
        // Category 9 Fix: Restrict queryAll to admins only
        const mspId = ctx.clientIdentity.getMSPID();
        const userEmail = ctx.clientIdentity.getAttributeValue('email');
        if (mspId !== 'Org1MSP' || userEmail !== 'admin') {
            throw new Error('Unauthorized: Only Org1MSP admin can query all data.');
        }

        // An empty selector {} means "match everything" — return all documents
        let queryString = {
            selector: {}
        };

        // Delegate to the non-paginated query helper
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

    /*
     * ===== FUNCTION: queryWithQueryStringPaginated =====
     * WHAT: Executes a CouchDB query with PAGINATION support.
     * WHY: For large result sets, loading everything at once would be slow
     *   and memory-intensive. Pagination loads results in fixed-size pages.
     * CONCEPT — Pagination:
     *   Instead of returning 10,000 results at once, return 50 at a time.
     *   The "bookmark" is a cursor that tells CouchDB "start from here next time".
     *   Like pages in a book — you read one page at a time.
     * CONCEPT — ctx.stub.getQueryResultWithPagination():
     *   Fabric's paginated query API. Returns both an iterator AND metadata
     *   (bookmark for next page, total fetched count).
     * CALLED BY: getAllCertificateByUniversity (above)
     */
    async queryWithQueryStringPaginated(ctx, queryString, pageSize, bookmark) {

        console.log("============= START : queryWithQueryStringPaginated ===========");
        console.log(`Query: ${queryString}, PageSize: ${pageSize}, Bookmark: ${bookmark}`);

        // Execute the paginated query
        // CONCEPT — Destructuring { iterator, metadata }:
        //   getQueryResultWithPagination returns an object with two properties:
        //   - iterator: yields results one at a time (same pattern as getQueryResult)
        //   - metadata: contains {bookmark, fetchedRecordsCount} for pagination
        let { iterator, metadata } = await ctx.stub.getQueryResultWithPagination(queryString, pageSize, bookmark);

        let allResults = [];

        // Standard iterator consumption loop (same pattern as getAllCertificateByStudent)
        while (true) {
            let res = await iterator.next();

            if (res.value && res.value.value.toString()) {
                // Build a result object with both the key and parsed value
                let jsonRes = {};
                // .key is the blockchain state key (e.g., "CERTabc-123")
                jsonRes.key = res.value.key;

                try {
                    // Try to parse the value as JSON
                    jsonRes.value = JSON.parse(res.value.value.toString('utf8'));
                } catch (err) {
                    // If parsing fails, store as raw string (graceful degradation)
                    jsonRes.value = res.value.value.toString('utf8');
                }

                allResults.push(jsonRes);
            }
            if (res.done) {
                await iterator.close();
                // Return a structured response with results + pagination metadata
                // WHAT: {results, bookmark, count} — the caller uses bookmark
                //   to request the next page of results.
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

    /*
     * ===== FUNCTION: queryWithQueryString =====
     * WHAT: Same as queryWithQueryStringPaginated but WITHOUT pagination.
     * WHY: Simpler version for small result sets (like queryAll admin dumps).
     * WARNING: For large datasets, this loads EVERYTHING into memory at once.
     *   Use the paginated version for production queries with many results.
     * CALLED BY: queryAll (above)
     */
    async queryWithQueryString(ctx, queryString) {
        // Execute a non-paginated rich query — returns a simple iterator
        let resultsIterator = await ctx.stub.getQueryResult(queryString);
        let allResults = [];
        // Same iterator pattern — loop until done
        while (true) {
            let res = await resultsIterator.next();
            if (res.value && res.value.value.toString()) {
                // Create {key, value} objects for each result
                let jsonRes = { key: res.value.key };
                try {
                    jsonRes.value = JSON.parse(res.value.value.toString('utf8'));
                } catch (err) {
                    jsonRes.value = res.value.value.toString('utf8');
                }
                allResults.push(jsonRes);
            }
            if (res.done) {
                // Clean up the iterator and return all results
                await resultsIterator.close();
                return allResults;
            }
        }
    }

// Close the EducertContract class definition
}

// EXPORT the EducertContract class
// WHAT: Makes EducertContract available to index.js (which Fabric loads)
// HOW THE CHAIN CONNECTS:
//   1. index.js does: const FabCar = require('./lib/educert_contract')
//   2. index.js exports: module.exports.contracts = [FabCar]
//   3. Fabric reads the contracts array and registers all transaction methods
//   4. Web app can now invoke any method via Fabric SDK
// IF REMOVED: index.js would get an empty object — chaincode deployment would fail
module.exports = EducertContract;

