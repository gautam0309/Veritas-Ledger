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
let enrollment = require("../services/fabric/enrollment");

// WHAT: Call enrollAdmin() to ensure the Fabric CA admin identity exists in the wallet
// WHY: The admin identity is required for all Fabric operations:
//   - Registering new users (universities/students)
//   - Submitting transactions to the blockchain
//   - Managing identities in the Fabric CA
// CONCEPT — Fire-and-forget:
//   enrollAdmin() is async but we DON'T await it here.
//   The app continues starting up while enrollment happens in the background.
//   If enrollment fails (e.g., CA is down), the app still starts but
//   Fabric operations will fail until the CA becomes available.
// IF REMOVED: No admin identity → can't register users → entire platform is non-functional
enrollment.enrollAdmin();