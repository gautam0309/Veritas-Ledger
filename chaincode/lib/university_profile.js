/*
 * ============================================================================
 * FILE: chaincode/lib/university_profile.js
 * ============================================================================
 * 
 * PURPOSE:
 *   Defines the UniversityProfile class — the DATA MODEL for a university's
 *   public profile that gets stored on the blockchain. When a university
 *   registers on the platform, an instance of this class is created and
 *   written to the ledger.
 *
 * WHY THIS FILE EXISTS:
 *   Every university that issues certificates must first register on the
 *   Blockchain with a public profile. This profile contains the university's
 *   name, public key (used for digital signatures), location, and description.
 *   The profile acts as the university's "identity card" on the blockchain.
 *
 * HOW IT CONNECTS TO OTHER FILES:
 *   - educert_contract.js → Creates UniversityProfile in registerUniversity()
 *   - educert_contract.js → Queries profiles in queryUniversityProfileByName()
 *   - educert_contract.js → Uses profiles for ABAC checks in issueCertificate()
 *   - web-app's university-controller.js triggers registration via Fabric SDK
 *
 * WHEN THIS FILE GETS EXECUTED:
 *   Inside Fabric peer containers whenever:
 *   - A new university registers (registerUniversity chaincode function)
 *   - Someone looks up a university's profile (queryUniversityProfileByName)
 *   - ABAC checks during certificate issuance (verifying university's public key)
 *
 * BLOCKCHAIN STORAGE:
 *   When stored, a UniversityProfile becomes a JSON object keyed by:
 *   - "UNI" + name       → main lookup by name
 *   - "UNI_EMAIL_" + email → index for looking up by email
 *   - "PK_" + publicKey   → index to prevent public key collisions
 * ============================================================================
 */

// Enable strict mode for safer JavaScript execution
'use strict';



// CONCEPT — Data Model Class:
//   This class represents a University's public profile.
//   It's intentionally simple — just a constructor and a deserialize method.
//   No business logic here — business logic lives in educert_contract.js.
//   This is a SEPARATION OF CONCERNS: data structure separate from business rules.
class UniversityProfile {
    /**
     * Creates a public profile for a university on the blockchain.
     * 
     * WHAT THIS CONSTRUCTOR DOES:
     *   Sets up a new UniversityProfile object with the university's details.
     *   This object will be serialized to JSON and stored on the blockchain.
     *
     * WHY EACH PARAMETER MATTERS:
     *   - name: Used as part of the blockchain key ("UNI" + name). Must be unique.
     *   - publicKey: Critical for certificate verification — this key verifies signatures.
     *   - location: Human-readable info (e.g., "Gurugram, India")
     *   - description: Human-readable info (e.g., "K.R. Mangalam University")
     *   - email: Used for ABAC (access control) — ensures only this university
     *     can issue/revoke certificates under its own profile.
     *
     * @param {String} name        — The official name of the university
     * @param {String} publicKey   — The university's ECDSA public key (for signature verification)
     * @param {String} location    — Physical location of the university
     * @param {String} description — A brief description of the university
     * @param {String} email       — The university's registered email (used for ABAC checks)
     */
    constructor(name, publicKey, location, description, email = "") {
        // Store the university's name
        // WHAT: Sets the name property on this instance
        // WHY: Used as part of the blockchain state key ("UNI" + name) for lookups
        // IF REMOVED: Cannot identify which university this profile belongs to
        this.name = name;

        // Store the university's ECDSA public key
        // WHAT: The public key that corresponds to the university's private key
        // WHY: THIS IS THE MOST IMPORTANT FIELD. When someone verifies a certificate:
        //   1. They get the certificate's universitySignature
        //   2. They get this publicKey from the university's profile
        //   3. They use the publicKey to verify the signature
        //   If verification passes → the certificate is authentic
        // CONCEPT — Public Key Cryptography:
        //   Every university has a KEY PAIR: private key (secret) + public key (shared).
        //   Private key: used to CREATE signatures (only the university has this)
        //   Public key: used to VERIFY signatures (anyone can get this from the blockchain)
        // IF REMOVED: Certificate verification would be impossible
        this.publicKey = publicKey;

        // Store the university's location
        // WHAT: Human-readable location string
        // WHY: Informational — displayed in the university's profile on the web app
        // IF REMOVED: The UI would show blank/undefined for location
        this.location = location;

        // Store the university's description
        // WHAT: Brief text description of the university
        // WHY: Informational — displayed in the university's profile
        // IF REMOVED: The UI would show blank/undefined for description
        this.description = description;

        // Store the university's email address
        // WHAT: Email like "krmu@krmu.edu.in"
        // WHY: Used for Attribute Based Access Control (ABAC):
        //   - During issueCertificate: checks if the caller's email matches this profile
        //   - During revokeCertificate: checks if the revoker is the original issuer
        //   - Stored as a blockchain index key ("UNI_EMAIL_" + email) for quick lookup
        // DEFAULT VALUE (email = ""):
        //   Empty string is the default — allows backward compatibility with older
        //   profiles that were registered before the email field was added.
        // IF REMOVED: ABAC checks would fail — any university could issue certs as another
        this.email = email;

        // Mark this object's type as "university"
        // WHAT: A discriminator field for CouchDB queries
        // WHY: The blockchain stores multiple types of data. This field lets us query:
        //   {selector: {dataType: "university"}} → returns only university profiles
        // IF REMOVED: CouchDB queries filtering by dataType would miss university profiles
        this.dataType = "university"
    }



    /**
     * Instantiate a UniversityProfile object from raw JSON data.
     *
     * WHAT: Takes a plain JSON object (from the blockchain) → returns a proper
     *   UniversityProfile instance with all its properties.
     *
     * WHY: When reading from the blockchain, you get raw JSON objects.
     *   This static factory method converts them back into class instances.
     *   (See Certificate.deserialize for a more detailed explanation of this pattern.)
     *
     * CONCEPT — Static Factory Method:
     *   `UniversityProfile.deserialize(data)` — called on the class, not an instance.
     *   This is a common pattern: provide a static method to create instances from
     *   raw data. Alternative patterns include using a plain function or a builder.
     *
     * @param {json} data — JSON data of a UniversityProfile read from the blockchain
     * @returns {UniversityProfile} — A properly instantiated UniversityProfile object
     */

    static deserialize(data) {
        // Create and return a new UniversityProfile from the raw JSON fields
        // WHAT: Calls the constructor with the data fields
        // WHY: Converts a plain object back into a proper UniversityProfile instance
        // IF REMOVED: Code querying university profiles from the blockchain would only
        //   get plain objects, not UniversityProfile instances
        return new UniversityProfile(data.name, data.publicKey, data.location, data.description, data.email);
    }
}

// Export the UniversityProfile class for use in other modules
// WHAT: Makes UniversityProfile available to educert_contract.js
// CONCEPT — Single Export: 
//   `module.exports = UniversityProfile` exports the class directly.
//   In the requiring file: `const UniversityProfile = require('./university_profile')`
//   This is different from `module.exports = { UniversityProfile }` which would
//   require destructuring: `const { UniversityProfile } = require('./university_profile')`
// IF REMOVED: educert_contract.js would crash trying to create UniversityProfile objects
module.exports = UniversityProfile;