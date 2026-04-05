/*
 * ============================================================================
 * FILE: web-app/database/models/certificates.js
 * ============================================================================
 * 
 * PURPOSE:
 *   Defines the Mongoose schema for the "certificates" MongoDB collection (Off-chain DB).
 *   
 * WHY STORE THIS OFF-CHAIN?
 *   - The blockchain (Fabric) stores the cryptographic proof, hashes, and revocation status.
 *   - MongoDB stores the actual readable certificate data (the "payload").
 *   - This separates data storage (MongoDB) from trust/verification (Blockchain).
 *   - It allows fast searching/indexing by rollNumber or email without querying the blockchain.
 * ============================================================================
 */

// WHAT: Import Mongoose (the MongoDB ODM library)
const mongoose = require('mongoose');

// WHAT: Import the validator library for email validation
const validator = require('validator');


// WHAT: Define the structure of a Certificate document in MongoDB
const certificateSchema = new mongoose.Schema({

    // WHAT: Student's unique registration/roll number at the university
    // WHY: Used to check for duplicates (can't issue two certs for same roll no at same uni)
    rollNumber: {
        type: String,
        required: true,
        trim: true,
    },
    // WHAT: Student's full name
    studentName: {
        type: String,
        required: true,
        trim: true,

    },
    // WHAT: Student's email (links to the students DB collection)
    studentEmail: {
        type: String,
        required: true,
        trim: true,
        minlength: 1,
        validate: {
            validator: validator.isEmail,
            message: '{VALUE} is not a valid email'
        }
    },
    // WHAT: Name of the university issuing the certificate
    universityName: {
        type: String,
        required: true,
        trim: true,
    },
    // WHAT: University's email (links to the universities DB collection)
    universityEmail: {
        type: String,
        required: true,
        trim: true,
        minlength: 1,
        validate: {
            validator: validator.isEmail,
            message: '{VALUE} is not a valid email'
        }
    },
    // WHAT: Degree major (e.g., "Computer Science")
    major: {
        type: String,
        required: true,
        trim: true
    },
    // WHAT: Department (e.g., "Engineering")
    departmentName: {
        type: String,
        required: true,
        trim: true
    },
    // WHAT: Cumulative Grade Point Average
    cgpa: {
        type: String, //Saved as string because easier to hash.
        required: true,
        // CONCEPT — Custom numeric validation on a string:
        //   Converts string to float internally to ensure it's between 0 and 10.
        validate: {
            validator: (v) => validator.isFloat(v, { min: 0, max: 10 }),
            message: '{VALUE} is not a valid CGPA (must be 0-10)'
        }
    },
    // WHAT: Date the certificate was issued
    dateOfIssuing: {
        type: Date,
        required: true
    },
    // --- New fields for enhancements ---
    // WHAT: Tracks if the certificate was revoked (Off-chain cache)
    // WHY: The true revocation status is on the blockchain. This is just a quick
    //   cache so the web app UI can show the status quickly without a blockchain query.
    revoked: {
        type: Boolean,
        default: false
    },
    // WHAT: Reason for revocation (e.g., "Plagiarism")
    revokedReason: {
        type: String,
        default: ''
    },
    // WHAT: When the revocation happened
    revokedAt: {
        type: Date,
        default: null
    },
    // WHAT: When the certificate expires (if applicable)
    expiryDate: {
        type: Date,
        default: null  // null = no expiry
    },
    // WHAT: Path to the visual representation of the cert (the PDF/Image file)
    certificateImage: {
        type: String,  // file path to uploaded image/PDF
        default: null
    }
});

// ════════════════════════════════════════════════════
// INDEXES
// ════════════════════════════════════════════════════

// WHAT: Create single-field indexes for fast lookups
// WHY: If a student asks "show me my certificates", MongoDB uses the studentEmail
//   index instead of scanning the entire database.
certificateSchema.index({ "studentEmail": 1 });
certificateSchema.index({ "universityEmail": 1 });
certificateSchema.index({ "rollNumber": 1 });

// WHAT: Compound Unique Index (Multi-column constraint)
// CONCEPT — Prevent duplicate certificates: same roll number at same university
//   If University A tries to issue a cert to Roll #123 TWICE, MongoDB blocks it.
//   But University A and University B can BOTH have a student with Roll #123.
certificateSchema.index({ "rollNumber": 1, "universityEmail": 1 }, { unique: true });

// WHAT: Compile schema into "certificates" model
let certificates = mongoose.model("certificates", certificateSchema);

// WHAT: Force index creation
certificates.createIndexes();

// WHAT: Export the model
module.exports = certificates;
