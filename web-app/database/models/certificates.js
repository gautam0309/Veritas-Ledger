const mongoose = require('mongoose');
const validator = require('validator');


const certificateSchema = new mongoose.Schema({

    rollNumber: {
        type: String,
        required: true,
        trim: true,
    },
    studentName: {
        type: String,
        required: true,
        trim: true,

    },
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
    universityName: {
        type: String,
        required: true,
        trim: true,
    },
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
    major: {
        type: String,
        required: true,
        trim: true
    },
    departmentName: {
        type: String,
        required: true,
        trim: true
    },
    cgpa: {
        type: String, //Saved as string because easier to hash.
        required: true,
    },
    dateOfIssuing: {
        type: Date,
        required: true
    },
    // --- New fields for enhancements ---
    revoked: {
        type: Boolean,
        default: false
    },
    revokedReason: {
        type: String,
        default: ''
    },
    revokedAt: {
        type: Date,
        default: null
    },
    expiryDate: {
        type: Date,
        default: null  // null = no expiry
    },
    certificateImage: {
        type: String,  // file path to uploaded image/PDF
        default: null
    }
});

certificateSchema.index({ "studentEmail": 1 });
certificateSchema.index({ "universityEmail": 1 });
certificateSchema.index({ "rollNumber": 1 });
// Prevent duplicate certificates: same roll number at same university
certificateSchema.index({ "rollNumber": 1, "universityEmail": 1 }, { unique: true });

let certificates = mongoose.model("certificates", certificateSchema);
certificates.createIndexes();

module.exports = certificates;
