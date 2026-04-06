/*
 * ============================================================================
 * FILE: web-app/loaders/fabric-loader.js
 * ============================================================================
 * 
 * PURPOSE:
 *   Bootstraps the Hyperledger Fabric admin identity at app startup.
 *   This tiny 2-line file triggers the admin enrollment process that
 *   creates the admin identity in the Fabric wallet.
 *
 * HOW IT CONNECTS:
 *   - Imported by app.js during startup (require('./loaders/fabric-loader'))
 *   - Calls enrollment.enrollAdmin() from services/fabric/enrollment.js
 *   - The enrollAdmin function contacts the Fabric CA to register/enroll admin
 *
 * WHY SEPARATE FILE:
 *   Keeps app.js clean — all Fabric initialization is isolated here.
 *   Following the "Loader Pattern": each loader initializes one subsystem.
 * ============================================================================
 */

// WHAT: Import the enrollment service that handles Fabric CA interactions
// WHY: We need the enrollAdmin() function to bootstrap the admin identity
// IF REMOVED: Admin enrollment wouldn't happen at startup — no Fabric operations would work
// VERCEL BUNDLE GUARD: Force include dynamic Fabric crypto modules
// This prevents the "Cannot find module 'fabric-common/lib/impl/CryptoSuite_ECDSA_AES'" error on Vercel.
try {
    require('fabric-common/lib/impl/CryptoSuite_ECDSA_AES');
} catch (e) {
    // This is purely for the Vercel bundler (NFT) to see the path during compilation.
}

let enrollment = require("../services/fabric/enrollment");

// WHAT: Call enrollAdmin() to ensure the Fabric CA admin identity exists in the wallet
// WHY: The admin identity is required for all Fabric operations:
//   - Registering new users (universities/students)
//   - Submitting transactions to the blockchain
//   - Managing identities in the Fabric CA
// CONCEPT — Fire-and-forget:
//   enrollAdmin() is async but we DON'T await it here to speed up startup.
//   We MUST catch any rejections to prevent crashing the server (Unhandled Promise Rejection).
enrollment.enrollAdmin().catch(err => {
    logger.error(`Hyperledger Fabric background initialization failed: ${err.message || err}. App will proceed in Limited Mode.`);
});