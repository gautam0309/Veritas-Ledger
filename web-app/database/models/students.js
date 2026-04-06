/*
 * ============================================================================
 * FILE: web-app/database/models/students.js
 * ============================================================================
 * 
 * PURPOSE:
 *   Defines the Mongoose schema for the "students" MongoDB collection.
 *   Similar to university.js, this handles student registration data,
 *   secure bcrypt password hashing, and authentication validation.
 *
 * HOW IT CONNECTS:
 *   - The web app relies on MongoDB for the student login portal
 *   - Fabric doesn't track students actively, it just stores certificates
 *     assigned to their public key. This DB tracks their actual account.
 * ============================================================================
 */

// WHAT: Import Mongoose (the MongoDB ODM library)
const mongoose = require('mongoose');

// WHAT: Import string validator (used for email format checking)
const validator = require('validator');

// WHAT: Import bcryptjs cryptography library (used to hash passwords securely)
const bcrypt = require('bcryptjs');


// WHAT: Define the structure of a Student document in MongoDB
const studentSchema = new mongoose.Schema({
    // WHAT: Student email (used as login username)
    email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,   // AUTOMATICALLY convert "Ali@Gmail.Com" to "ali@gmail.com"
        minlength: 1,
        unique: true,      // Tells MongoDB: no two students can have the same email
        // CONCEPT — Format Validation:
        //   Ensures "bob.gmail.com" gets rejected before attempting to save to DB
        validate: {
            validator: validator.isEmail,
            message: '{VALUE} is not a valid email'
        }
    },
    // WHAT: Full name of the student
    name: {
        type: String,
        required: true,
        trim: true,

    },
    // WHAT: The student's hashed password
    password: {
        type: String,
        required: true,
        minlength: 2,
        // CONCEPT — select: false:
        //   Hides this field by default. `Student.find()` won't return passwords
        //   unless explicitly asked with `.select('+password')`. Security best practice.
        select: false
    },

    // WHAT: The cryptographic Public Key assigned to the student
    // WHY: Certificates on the blockchain are issued TO this public key.
    //   When a student logs in, the app uses this key to query the blockchain
    //   for their certificates via `getAllCertificateByStudent`.
    publicKey: {  //hex value of key
        type: String,
        required: true,
        unique: true,      // Public keys must be globally unique
        minlength: 10
    }

});

// ════════════════════════════════════════════════════
// STATIC METHODS (Applied to the student model class)
// ════════════════════════════════════════════════════

// WHAT: Helper to hash plain text passwords with a cryptographic salt
// WHY: Plain text passwords are huge vulnerabilities. Hashing is a one-way trip.
studentSchema.statics.saltAndHashPassword = async function (password) {

    // Wrap the old callback-based bcrypt function in a modern Promise
    return new Promise((resolve, reject) => {
        // Hash the password with 10 salt rounds (computational complexity)
        bcrypt.hash(password, 10, function (err, hash) {
            if (err) {
                reject(err);
            }
            resolve(hash);
        });
    })

};

// WHAT: Authentication logic called during student login
// CALLED BY: student-middleware.js during POST /student/login
studentSchema.statics.validateByCredentials = function (email, password) {
    let User = this;

    // Step 1: Look up student by email, forcing Mongoose to include the hidden password
    return User.findOne({ email }).select('+password').then((user) => {
        // No student found with that email
        if (!user) {
            return Promise.reject();
        }

        // Step 2: Compare the injected plain-text password with the stored hash
        return new Promise((resolve, reject) => {
            // Use bcrypt.compare to compare password and user.password
            // CONCEPT — Cryptographic comparison: 
            //   It hashes the input password and compares the hashes.
            bcrypt.compare(password, user.password, (err, res) => {
                if (res) {
                    //Login was successful. Signals a successful login. Update
                    resolve(user); // Success
                } else {
                    reject();      // Wrong password
                }
            });
        });
    });
};

// ════════════════════════════════════════════════════
// MIDDLEWARE (Mongoose Hooks)
// ════════════════════════════════════════════════════

// WHAT: Pre-save hook — runs immediately before writing to MongoDB
// WHY: Ensures any new or changed passwords get hashed before storage
studentSchema.pre('save', async function () {
    let user = this; // The document being saved

    // Only hash if the password field was actually modified
    if (user.isModified('password')) {
        try {
            // Call the hashing helper and replace the plain text with the hash
            let hash = await user.constructor.saltAndHashPassword(this.password);
            user.password = hash;
        } catch (e) {
            throw e;
        }
    }
});


// WHAT: Apply the unique index constraint to the email field on the DB level
studentSchema.index({ "email": 1 }, { unique: true });

// WHAT: Compile the schema into the "students" collection Model
let students = mongoose.model("students", studentSchema);

// WHAT: Export the model for controllers/services to use
module.exports = students;
