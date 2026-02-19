const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
    action: {
        type: String,
        required: true,
        enum: ['certificate_issued', 'certificate_verified', 'certificate_revoked', 'proof_generated', 'proof_verified', 'login', 'registration']
    },
    performedBy: {
        type: String,
        default: 'anonymous'
    },
    targetCertId: {
        type: String,
        default: null
    },
    details: {
        type: String,
        default: ''
    },
    ipAddress: {
        type: String,
        default: ''
    },
    timestamp: {
        type: Date,
        default: Date.now
    }
});

auditLogSchema.index({ timestamp: -1 });
auditLogSchema.index({ action: 1 });

let AuditLog = mongoose.model("auditlogs", auditLogSchema);

module.exports = AuditLog;
