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
        type: String, 
        required: true,
        validate: {
            validator: (v) => validator.isFloat(v, { min: 0, max: 10 }),
            message: '{VALUE} is not a valid CGPA (must be 0-10)'
        }
    },
    dateOfIssuing: {
        type: Date,
        required: true
    },
    
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
        default: null  
    },
    certificateImage: {
        type: String,  
        default: null
    }
});

certificateSchema.index({ "studentEmail": 1 });
certificateSchema.index({ "universityEmail": 1 });
certificateSchema.index({ "rollNumber": 1 });

certificateSchema.index({ "rollNumber": 1, "universityEmail": 1 }, { unique: true });

let certificates = mongoose.model("certificates", certificateSchema);
certificates.createIndexes();

module.exports = certificates;
