'use strict';

/*
 * ============================================================================
 * FILE: web-app/services/fabric/enrollment.js
 * ============================================================================
 * 
 * PURPOSE:
 *   Handles interaction with the Hyperledger Fabric Certificate Authority (CA).
 *   This is where we "talk" to the CA to verify identities, register new users,
 *   and obtain cryptographic X.509 certificates to sign blockchain transactions.
 *
 * HOW IT CONNECTS:
 *   - `enrollAdmin` is called on server startup to get the master admin key.
 *   - `registerUser` is called by University/Student controllers during signup.
 *   - Uses `wallet-utils.js` and `encrypted-wallet.js` to store keys safely.
 *
 * CONCEPT — Register vs Enroll:
 *   Register: Telling the CA "Hey, there's a new user coming, here's their info."
 *   Enroll: The actual user knocking on the CA's door, proving who they are,
 *           and getting their cryptographic identity (Private & Public Keys).
 * ============================================================================
 */


// WHAT: The Fabric SDK dependencies are now loaded LAZILY inside functions.
// WHY: In cloud environments (Vercel), these modules can fail during startup.
//   By moving them inside functions, the web app can still boot even if the Fabric
//   SDK is unstable, allowing "Limited Mode" to work.
// const FabricCAServices = require('fabric-ca-client');
// const { Wallets } = require('fabric-network');
const path = require('path');
const config = require('../../loaders/config');
const fs = require('fs');

// Helpers for wallet management
// WHAT: Moved to lazy imports within functions.
// const walletUtils = require('./wallet-utils');
const logger = require('../logger');

// WHAT: Helper to safely load the CCP from disk
// WHY: If the file is missing (common on Vercel), we want to fail gracefully with a log, 
//   not crash the entire server with a 500 error.
function getSafeCCP() {
    try {
        if (!fs.existsSync(config.fabric.ccpPath)) {
            logger.warn(`CCP file not found at ${config.fabric.ccpPath}. Hyperledger Fabric operations will be disabled.`);
            return null;
        }
        return JSON.parse(fs.readFileSync(config.fabric.ccpPath, 'utf8'));
    } catch (err) {
        logger.error(`Error reading CCP file: ${err.message}`);
        return null;
    }
}

/**
 * Enrolls Admin object into wallet.
 * @returns {Promise<{Keys}>}
 */

/*
 * ===== FUNCTION: enrollAdmin =====
 * WHAT: Obtains the master admin identity from the CA and saves it to the wallet.
 * WHY: Only an admin can register new users. If we don't do this, nobody can sign up.
 * CALLED FROM: fabric-loader.js (on server startup)
 */
async function enrollAdmin() {
    try {

        // WHAT: Load the CCP safely
        const ccp = getSafeCCP();
        if (!ccp) {
            logger.error('Cannot enroll admin: CCP not found.');
            return { fabricOffline: true };
        }

        // WHAT: Lazy load the Fabric SDK and helpers
        const FabricCAServices = require('fabric-ca-client');
        const { getMongoWallet } = require('./mongo-wallet');
        const walletUtils = require('./wallet-utils');

        // Create a new CA client for interacting with the CA.
        // WHAT: Extracts CA connection details from the Common Connection Profile
        const caInfo = ccp.certificateAuthorities['ca.org1.example.com'];
        const caTLSCACerts = caInfo.tlsCACerts.pem;
        // Connect to the CA service (verify: false is used for self-signed development certs)
        const ca = new FabricCAServices(caInfo.url, { trustedRoots: caTLSCACerts, verify: false }, caInfo.caName);

        const wallet = await getMongoWallet();

        // Check if we've already done this
        const identity = await wallet.get('admin');
        if (identity) {
            logger.info('An identity for the admin user "admin" already exists in the wallet.');
            return;
        }

        // Enroll the admin user!
        // WHAT: CA issues a new cert based on default admin credentials defined in docker-compose
        const enrollment = await ca.enroll({ enrollmentID: 'admin', enrollmentSecret: 'adminpw' });
        
        // Save the received certificates into the wallet
        let adminKeys = await walletUtils.createNewWalletEntity(enrollment, "admin");
        logger.info('Successfully enrolled admin user "admin" and imported it into the wallet.');
        return adminKeys;
    } catch (error) {
        logger.error(`Failed to enroll admin user "admin": ${error.message || error}`);
        // Category 4 Fix: Don't exit process, allow the web app to run in "Limited Mode"
    }
}

/**
 * Enrolls a generic user into the client (Used for students and universities)
 * @param email
 * @returns {Promise<{Keys} | Error>}
 * TODO: There's no way to differentiate students and universities in the MSP this way. Possibly consider changing.
 */

/*
 * ===== FUNCTION: registerUser =====
 * WHAT: Registers AND enrolls a brand new user (university or student) on the Fabric Network.
 * WHY: Users need a crypto identity to interact with the blockchain.
 * CALLED FROM: student-controller.js and university-controller.js during signup.
 */
async function registerUser(email) {
    try {
        // Setup CA client connection (same logic as enrollAdmin)
        const FabricCAServices = require('fabric-ca-client');
        const { getMongoWallet } = require('./mongo-wallet');
        const walletUtils = require('./wallet-utils');

        const ccp = getSafeCCP();
        if (!ccp) {
            logger.error('Cannot register user: CCP not found. Generating mock identity.');
            // WHAT: Mock identity for Vercel/Cloud environments
            // WHY: satisfies Mongoose validation so the app remains usable in "Limited Mode"
            return { 
                fabricOffline: true, 
                publicKey: "OFFLINE_TEMP_PUBKEY_" + Math.random().toString(36).substring(7),
                privateKey: "OFFLINE_TEMP_PRIVKEY"
            };
        }
        const caInfo = ccp.certificateAuthorities['ca.org1.example.com'];
        const caTLSCACerts = caInfo.tlsCACerts.pem;
        const ca = new FabricCAServices(caInfo.url, { trustedRoots: caTLSCACerts, verify: false }, caInfo.caName);

        const wallet = await getMongoWallet();

        // Check to see if we've already enrolled the user.
        // We use email as the unique identifier on the network
        const userIdentity = await wallet.get(email);
        if (userIdentity) {
            throw Error(`An identity for the user ${email} already exists in the wallet`);
        }

        // Check to see if we have the admin identity!
        // WHY: We need admin privileges to tell the CA to register a new user
        let adminIdentity = await wallet.get('admin');
        if (!adminIdentity) {
            // AUTO-HEAL: If admin is missing (cold start race condition or purged DB),
            // enroll it now before proceeding.
            logger.info('Admin identity missing — auto-enrolling before registration...');
            await enrollAdmin();
            adminIdentity = await wallet.get('admin');
            if (!adminIdentity) {
                throw Error('Admin auto-enrollment failed. Cannot register user.');
            }
        }

        // Build a user object for authenticating with the CA using the admin's identity
        const provider = wallet.getProviderRegistry().getProvider(adminIdentity.type);
        const adminUser = await provider.getUserContext(adminIdentity, 'admin');

        // STEP 1: REGISTER
        // WHAT: Tell the CA "I authorize 'email' to join the network. Here are their attributes."
        // ABAC NOTE: Notice the 'attrs' array. We embed the user's email directly into their
        //   cryptographic certificate (ecert: true). This is the key to Attribute-Based Access Control.
        const secret = await ca.register({
            affiliation: 'org1.department1',
            enrollmentID: email,
            role: 'client',
            attrs: [
                { name: 'email', value: email, ecert: true }
            ]
        }, adminUser);

        // STEP 2: ENROLL
        // WHAT: The new user claims their identity using the secret generated in step 1.
        // We MUST request the 'email' attribute to be embedded in the final cert.
        const enrollment = await ca.enroll({
            enrollmentID: email,
            enrollmentSecret: secret,
            attr_reqs: [
                { name: 'email', optional: false }
            ]
        });

        // STEP 3: SAVE TO WALLET
        let userKeys = await walletUtils.createNewWalletEntity(enrollment, email);
        logger.info(`Successfully registered and enrolled  user ${email} and imported it into the wallet`);
        
        // Output the keys (used heavily by university signup to get the PK for the ledger)
        return userKeys;

    } catch (error) {
        // Category 4 Fix: Circuit Breaker for Offline Fabric CA
        // WHAT: Detect if the error is a connection failure (e.g., CA Docker container down)
        const isConnectionError = error.message && (
            error.message.includes('Connect Failed') || 
            error.message.includes('ECONNREFUSED') ||
            error.message.includes('failed to connect') ||
            error.message.includes('DiscoveryService')
        );

        if (isConnectionError) {
            logger.error(`FABRIC CA OFFLINE: Certificate Authority unreachable. Returning mock identity.`);
            return { 
                fabricOffline: true, 
                error: error.message,
                publicKey: "OFFLINE_TEMP_PUBKEY_" + Math.random().toString(36).substring(7),
                privateKey: "OFFLINE_TEMP_PRIVKEY"
            };
        }

        logger.error(`Failed to register user ${email}": ${error.message || error}`);
        throw error;
    }
}

/**
 * Deletes a user from the CA.
 * @param {string} email - The user's email/enrollment ID
 */

/*
 * ===== FUNCTION: deleteUser =====
 * WHAT: Removes a user from the CA (useful during testing/resetting state).
 * WHY: If we delete a user's local wallet file but don't delete them from the CA,
 *   we won't be able to re-register them with the same email.
 */
async function deleteUser(email) {
    try {
        const FabricCAServices = require('fabric-ca-client');
        const { getMongoWallet } = require('./mongo-wallet');

        const ccp = getSafeCCP();
        if (!ccp) {
            logger.error('Cannot delete user: CCP not found.');
            return { fabricOffline: true };
        }
        const caInfo = ccp.certificateAuthorities['ca.org1.example.com'];
        const caTLSCACerts = caInfo.tlsCACerts.pem;
        const ca = new FabricCAServices(caInfo.url, { trustedRoots: caTLSCACerts, verify: false }, caInfo.caName);

        const wallet = await getMongoWallet();

        let adminIdentity = await wallet.get('admin');
        if (!adminIdentity) {
            await enrollAdmin();
            adminIdentity = await wallet.get('admin');
            if (!adminIdentity) {
                throw Error('Admin auto-enrollment failed. Cannot delete user.');
            }
        }


        const provider = wallet.getProviderRegistry().getProvider(adminIdentity.type);
        const adminUser = await provider.getUserContext(adminIdentity, 'admin');

        // Access the CA's internal Identity Service and issue a delete command as admin
        const idService = ca.newIdentityService();
        await idService.delete(email, adminUser);
        logger.info(`Successfully deleted user ${email} from CA`);
    } catch (error) {
        logger.warn(`Failed to delete user ${email} from CA: ${error.message}`);
        // Often it's okay if deletion fails (e.g., user already gone)
    }
}

module.exports = { enrollAdmin, registerUser, deleteUser };
