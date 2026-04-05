/*
 * ============================================================================
 * FILE: web-app/database/models/auditlog.js
 * ============================================================================
 * 
 * PURPOSE:
 *   Defines the Mongoose schema for the "auditlogs" MongoDB collection.
 *   Used by the Alert Service (SAMM Operations L3) to track security-relevant
 *   events like logins, certificate issuances, and validation attempts.
 *
 * HOW IT CONNECTS:
 *   - The schema describes what an audit log entry looks like in the DB.
 *   - Exported model is used by the alert-service.js to save() new logs
 *   - Helps satisfy security compliance by keeping an immutable history.
 * ============================================================================
 */

// WHAT: Import mongoose (the ODM library)
// WHY: Mongoose provides the Schema and model constructors needed to define database shapes.
const mongoose = require('mongoose');

// WHAT: Define the structure (schema) for an audit log entry
// CONCEPT — Mongoose Schema:
//   Maps JavaScript object properties to MongoDB document keys, enforcing types
//   and validation rules before anything is saved to the database.
const auditLogSchema = new mongoose.Schema({
    // WHAT: The type of event that occurred (e.g., "certificate_issued")
    action: {
        type: String,     // Must be string
        required: true,   // Cannot be null or omitted
        // CONCEPT — enum validation:
        //   Restricts the value to exactly one of the strings in this array.
        //   If we try to save action: 'hacked_the_system', Mongoose throws a ValidationError.
        enum: ['certificate_issued', 'certificate_verified', 'certificate_revoked', 'proof_generated', 'proof_verified', 'login', 'registration']
    },
    // WHAT: Who triggered the event (usually user email or identity string)
    performedBy: {
        type: String,
        default: 'anonymous' // If not provided, fallback to 'anonymous'
    },
    // WHAT: For certificate events, which certificate was affected?
    targetCertId: {
        type: String,
        default: null        // Login events won't have a target cert, so null is fine
    },
    // WHAT: Extra context (e.g., "Failed login attempt: bad password")
    details: {
        type: String,
        default: ''
    },
    // WHAT: IP address where the request originated
    ipAddress: {
        type: String,
        default: ''
    },
    // WHAT: When did this event happen?
    timestamp: {
        type: Date,          // Stored as a MongoDB Date object (BSON UTC Date)
        default: Date.now    // CONCEPT — default function: Whenever a new log is created, it calls Date.now() automatically
    }
});

// WHAT: Create database indexes for faster querying
// CONCEPT — Indexes:
//   Like an index at the back of a book. Instead of scanning every log entry
//   to find logins from yesterday, MongoDB consults the index.
//   1 = Ascending order, -1 = Descending order.
auditLogSchema.index({ timestamp: -1 }); // Fast sorting by newest events
auditLogSchema.index({ action: 1 });     // Fast filtering by action type (e.g., give me all 'login' events)

// WHAT: Compile the schema into a Mongoose Model
// CONCEPT — Mongoose Model:
//   The Model is the actual class used to interact with the database 
//   (e.g., AuditLog.find(), new AuditLog().save()).
//   "auditlogs" is the name of the collection in MongoDB.
let AuditLog = mongoose.model("auditlogs", auditLogSchema);

// WHAT: Export the compiled model so other files can use it
// IF REMOVED: Services couldn't record audit logs.
module.exports = AuditLog;
