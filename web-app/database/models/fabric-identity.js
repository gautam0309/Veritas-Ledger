const mongoose = require('mongoose');

const FabricIdentitySchema = new mongoose.Schema({
    label: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    identity: {
        type: String, // Stringified JSON identity object
        required: true
    },
    version: {
        type: Number,
        default: 1
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('FabricIdentity', FabricIdentitySchema);
