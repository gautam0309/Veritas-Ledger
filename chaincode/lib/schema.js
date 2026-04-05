/*
 * ============================================================================
 * FILE: chaincode/lib/schema.js
 * ============================================================================
 * 
 * PURPOSE:
 *   Defines the Schema class — a blueprint that describes the STRUCTURE of
 *   a certificate. It specifies which fields a certificate contains and in
 *   what ORDER they should appear. This ordering is critical because the
 *   certificate data must be hashed in a consistent order for signatures
 *   to be verifiable.
 *
 * WHY THIS FILE EXISTS:
 *   When a certificate is issued, the system creates a hash of its fields.
 *   If the fields are hashed in a different order, you get a DIFFERENT hash,
 *   which breaks verification. The Schema ensures everyone (issuer, student,
 *   verifier) processes fields in the exact same order.
 *
 * HOW IT CONNECTS TO OTHER FILES:
 *   - Used by educert_contract.js (initLedger creates Schema, queryCertificateSchema reads it)
 *   - The web-app's university-controller.js fetches this schema from the ledger
 *     to know which fields to include when generating certificate hashes
 *
 * WHEN THIS FILE GETS EXECUTED:
 *   - Inside the Fabric peer container when chaincode transactions run
 *   - First usage: initLedger() creates a "v1" schema and stores it on the ledger
 *   - Subsequent usage: queryCertificateSchema("v1") reads it back
 *
 * ANALOGY:
 *   Think of Schema like a form template. Before you fill out a form, you need
 *   to know: "What fields does this form have? In what order?" That's what
 *   Schema defines for certificates.
 * ============================================================================
 */

// Example of what a Schema instance looks like when stored on the blockchain:
// UniversitySchema = {
//     dataType : "schema",
//     id: "v1",
//     ordering: ["studentName", "studentEmail", "universityName", "universityEmail", "major", "departmentName", "cgpa"],
//     certificateType: "university degree"
// }


// CONCEPT — class:
//   A `class` in JavaScript is a blueprint for creating objects. It defines
//   what properties (data) and methods (functions) an object will have.
//   Classes were introduced in ES6 (2015). Before that, JavaScript used
//   constructor functions and prototypes to achieve the same thing.
// WHY A CLASS HERE: We need to create Schema objects with consistent structure.
//   A class ensures every Schema always has certificateType, id, ordering, dataType.
class Schema {
    /**
    * Schema for a certain type of certificate
    * @param {String} certificateType  — What kind of certificate this schema is for (e.g., "university degree")
    * @param {String} id               — Version identifier for the schema (e.g., "v1", "v2")
    * @param {String[]} ordering       — Array of field names in the ORDER they must be hashed
    */

    // CONCEPT — constructor:
    //   The constructor is a special method that runs automatically when you do `new Schema(...)`.
    //   It sets up the initial state (properties) of the object.
    //   Think of it as the "setup" or "initialization" function.
    // PARAMETERS:
    //   - certificateType: String like "university degree" — identifies what kind of cert this schema describes
    //   - id: String like "v1" — version number so we can update schemas later without breaking old ones
    //   - ordering: Array of Strings like ["universityName", "major", "cgpa"] — field order for hashing
    constructor(certificateType, id, ordering){
        // `this` refers to the specific Schema instance being created.
        // CONCEPT — this:
        //   Inside a class, `this` always refers to the current object instance.
        //   When you do `let s = new Schema("degree", "v1", [...])`, `this` refers to `s`.

        // Store the certificate type on this instance
        // WHAT: Sets the type of certificate this schema applies to
        // WHY: So we can look up "which schema do I use for a university degree?"
        // IF REMOVED: We wouldn't know what kind of certificate this schema is for
        this.certificateType = certificateType;

        // Store the schema version identifier
        // WHAT: Sets a version ID like "v1" for this schema
        // WHY: Allows versioning — if we add new fields later, we create "v2" without breaking "v1"
        // IF REMOVED: No way to distinguish between different schema versions
        this.id = id;

        // Store the field ordering array
        // WHAT: Defines the exact order of fields when creating a certificate hash
        // WHY: Hash("A" + "B") ≠ Hash("B" + "A"). Order matters for cryptographic consistency.
        // IF REMOVED: Certificate hashing would have no defined order — verification would break
        this.ordering = ordering;

        // Mark this object's data type as "schema"
        // WHAT: A tag/label that identifies this object as a schema in the blockchain database
        // WHY: The blockchain (CouchDB) stores many types of data (certificates, universities, schemas).
        //   This field lets us filter/query: "give me all objects where dataType == 'schema'"
        // IF REMOVED: CouchDB queries filtering by dataType would miss schema objects
        this.dataType = "schema"
    }
    
    
    
    /**
    * Instantiate a Schema object from raw JSON data.
    * 
    * WHAT THIS METHOD DOES:
    *   Takes a plain JSON object (e.g., from the blockchain) and converts it
    *   back into a proper Schema class instance with all its methods.
    *
    * WHY IT EXISTS:
    *   When data is stored on the blockchain, it's stored as a JSON string.
    *   When you read it back, you get a plain JavaScript object (no methods).
    *   `deserialize` converts that plain object back into a Schema instance.
    *
    * CONCEPT — static:
    *   A `static` method belongs to the CLASS ITSELF, not to instances.
    *   You call it as `Schema.deserialize(data)`, NOT `mySchema.deserialize(data)`.
    *   Think of it as a "factory method" — it creates new instances.
    *
    * @param {json} data — JSON data that was stored on the blockchain
    * @returns {Schema} — A proper Schema object with all methods available
    */
    static deserialize(data) {
        // Create and return a new Schema instance from the JSON fields
        // WHAT: Calls `new Schema(...)` with the fields extracted from the raw JSON data
        // WHY: Converts a "dumb" JSON object back into a "smart" Schema object
        // IF REMOVED: Code reading schemas from blockchain would only get plain objects,
        //   not proper Schema instances (which matters if Schema had methods to call)
        return new Schema(data.certificateType, data.id, data.ordering);
    }
    
}

// CONCEPT — module.exports:
//   Makes the Schema class available to other files that `require()` this file.
//   When educert_contract.js does `require('./schema')`, it gets this Schema class.
// WHAT THIS LINE DOES: Exports the Schema class as the default export of this module
// IF REMOVED: Other files would get an empty object when requiring this file — 
//   any code doing `new Schema(...)` would fail with "Schema is not a constructor"
module.exports = Schema; 