/*
 * ============================================================================
 * FILE: web-app/database/models/universities.js
 * ============================================================================
 * 
 * PURPOSE:
 *   Defines the Mongoose schema for the "universities" MongoDB collection.
 *   Handles university registration data, password hashing (bcrypt), and
 *   credential validation for login.
 *
 * HOW IT CONNECTS:
 *   - The web app stores primary identity data (passwords, emails) in MongoDB
 *   - Blockchain (Fabric) only stores the public key and basic profile
 *   - This file bridges the gap by providing methods to salt/hash passwords
 *     and authenticate universities before they can interact with the ledger.
 * ============================================================================
 */

// WHAT: Import Mongoose (the MongoDB ODM library)
const mongoose = require('mongoose');

// WHAT: Import the validator library
// WHY: Used to check if strings are valid emails (e.g., "test@uni.edu" vs "not-an-email")
const validator = require('validator');

// WHAT: Import bcryptjs for password hashing
// WHY: NEVER store plain text passwords. Bcrypt hashes passwords securely using a "salt".
const bcrypt = require('bcryptjs');


// WHAT: Define the structure of a University document in MongoDB
const universitySchema = new mongoose.Schema({
    // WHAT: University email (used as login username and unique identifier)
    email: {
        type: String,
        required: true,
        trim: true,        // Removes whitespace (" test@x.com " -> "test@x.com")
        minlength: 1,
        unique: true,      // Tells MongoDB: no two universities can have the same email
        // CONCEPT — Custom Validation:
        //   Before saving, Mongoose runs this function. If it returns false,
        //   the save fails and throws the message '{VALUE} is not a valid email'.
        validate: {
            validator: validator.isEmail,
            message: '{VALUE} is not a valid email'
        }
    },
    // WHAT: Official university name
    name: {
        type: String,
        required: true,
        trim: true,
        unique: true       // Names must also be unique across the platform
    },
    // WHAT: Brief description of the university
    description: {
        type: String,
        required: true,
        trim: true,
    },
    // WHAT: Physical location/address
    location: {
        type: String,
        required: true,
        trim: true,
    },
    // WHAT: The user's hashed password
    password: {
        type: String,
        required: true,
        minlength: 2,
        // CONCEPT — select: false:
        //   When we query the database (e.g., University.find()), do NOT return the
        //   password field by default. This prevents accidentally sending passwords
        //   to the frontend. We have to explicitly ask for it with .select('+password').
        select: false
    },
    // WHAT: The cryptographic Public Key used for Fabric digital signatures
    // WHY: Generated during registration, tied to the user's hidden Private Key
    publicKey: {   //hex value of key
        type: String,
        required: true,
        minlength: 10
    }

});

// ════════════════════════════════════════════════════
// STATIC METHODS (Applied to the whole model/collection)
// ════════════════════════════════════════════════════

// WHAT: Custom method to hash a plain text password before saving
// CONCEPT — Schema Statics vs Methods:
//   .statics are functions on the Model class itself (e.g., University.saltAndHashPassword("pwd"))
//   .methods are functions on a specific document (e.g., const u = new Uni(); u.myMethod())
universitySchema.statics.saltAndHashPassword = async function (password) {
    // CONCEPT — Wrapping callbacks in a Promise:
    //   bcrypt.hash uses older callback style. We wrap it in a Promise so we
    //   can use async/await when calling this function elsewhere.
    return new Promise((resolve, reject) => {
        // WHAT: Hash the password with 10 "salt rounds"
        // WHY 10? A balance between security (slow to compute, resists brute force)
        //   and UX (fast enough for normal login).
        bcrypt.hash(password, 10, function (err, hash) {
            if (err) {
                reject(err);
            }
            resolve(hash);
        });
    })

};


// WHAT: Logic for authenticating a university (checking email/password during login)
// CALLED BY: university-middleware.js during POST /university/login
universitySchema.statics.validateByCredentials = function (email, password) {
    let User = this; // 'this' refers to the University model class

    // Step 1: Find the user by email, explicitly requesting the hidden password field
    return User.findOne({ email }).select('+password').then((user) => {
        // If email not found, reject the promise (login failed)
        if (!user) {
            return Promise.reject();
        }

        // Step 2: Compare the provided plain password against the stored bcrypt hash
        return new Promise((resolve, reject) => {
            // Use bcrypt.compare to compare password and user.password
            // CONCEPT — Hash comparison:
            //   It doesn't "decrypt" the hash. It takes the plain password, hashes it
            //   with the same salt, and sees if the resulting hashes match.
            bcrypt.compare(password, user.password, (err, res) => {
                if (res) {
                    //Login was successful. Signals a successful login. Update
                    resolve(user); // Send back the user object
                } else {
                    reject();      // Password mismatch
                }
            });
        });
    });
};

// ════════════════════════════════════════════════════
// MIDDLEWARE (Hooks)
// ════════════════════════════════════════════════════

// WHAT: A "pre-save hook" that runs automatically immediately before storing in DB
// WHY: Ensures we NEVER save a plain-text password. If the password field was
//   changed (or created), we hash it before letting MongoDB save it.
universitySchema.pre('save', async function () {
    let user = this; // 'this' refers to the document being saved

    // CONCEPT — isModified():
    //   Mongoose tracks which fields were changed. If they just updated their
    //   location, we don't need to re-hash the password.
    if (user.isModified('password')) {
        try {
            // Call the static method we defined above
            let hash = await user.constructor.saltAndHashPassword(this.password);
            user.password = hash; // Replace plain text with cipher text
        } catch (e) {
            throw e;
        }
    }
});

// WHAT: Tell MongoDB to maintain an index on the email field and enforce uniqueness
// WHY: Redundant backup to the `unique: true` in the schema definition above.
universitySchema.index({ "email": 1 }, { unique: true });

// WHAT: Compile the schema into the actual Mongoose Model
// "universities" represents the MongoDB collection name
let universities = mongoose.model("universities", universitySchema);

// WHAT: Instruct MongoDB to build the indexes (like the email uniqueness index)
// WHY: Because we have autoIndex: false in mongoose.js, we must call this manually.
universities.createIndexes();  //idempotent operation. Only called once.  (Calling createIndex manually like this is perfectly fine if autoIndex is turned off)

// WHAT: Export the model for use in controllers and services
module.exports = universities;
