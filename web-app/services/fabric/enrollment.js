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


// WHAT: The Fabric CA Client library
// WHY: Specific library used only for talking to the CA (different from Gateway)
const FabricCAServices = require('fabric-ca-client');

const { Wallets } = require('fabric-network');
const path = require('path');
const config = require('../../loaders/config');
const fs = require('fs');

// Helpers for wallet management
const walletUtils = require('./wallet-utils');
const logger = require('../logger');

//Connection Profile;
// WHAT: Load network details (IPs, ports, certificates) into memory
const ccp = JSON.parse(fs.readFileSync(config.fabric.ccpPath, 'utf8'));

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

        // Create a new CA client for interacting with the CA.
        // WHAT: Extracts CA connection details from the Common Connection Profile
        const caInfo = ccp.certificateAuthorities['ca.org1.example.com'];
        const caTLSCACerts = caInfo.tlsCACerts.pem;
        // Connect to the CA service (verify: false is used for self-signed development certs)
        const ca = new FabricCAServices(caInfo.url, { trustedRoots: caTLSCACerts, verify: false }, caInfo.caName);

        // Access our encrypted storage layer
        const { getEncryptedWallet } = require('./encrypted-wallet');
        const wallet = await getEncryptedWallet(config.fabric.walletPath);

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
        logger.error(`Failed to enroll admin user "admin": ${error}`);
        process.exit(1);
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
        const caInfo = ccp.certificateAuthorities['ca.org1.example.com'];
        const caTLSCACerts = caInfo.tlsCACerts.pem;
        const ca = new FabricCAServices(caInfo.url, { trustedRoots: caTLSCACerts, verify: false }, caInfo.caName);

        const { getEncryptedWallet } = require('./encrypted-wallet');
        const wallet = await getEncryptedWallet(config.fabric.walletPath);

        // Check to see if we've already enrolled the user.
        // We use email as the unique identifier on the network
        const userIdentity = await wallet.get(email);
        if (userIdentity) {
            throw Error(`An identity for the user ${email} already exists in the wallet`);
        }

        // Check to see if we have the admin identity!
        // WHY: We need admin privileges to tell the CA to register a new user
        const adminIdentity = await wallet.get('admin');
        if (!adminIdentity) {
            throw Error('An identity for the admin user "admin" does not exist in the wallet');

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
        logger.error(`Failed to register user ${email}": ${error}`);
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
        const caInfo = ccp.certificateAuthorities['ca.org1.example.com'];
        const caTLSCACerts = caInfo.tlsCACerts.pem;
        const ca = new FabricCAServices(caInfo.url, { trustedRoots: caTLSCACerts, verify: false }, caInfo.caName);

        const { getEncryptedWallet } = require('./encrypted-wallet');
        const wallet = await getEncryptedWallet(config.fabric.walletPath);

        const adminIdentity = await wallet.get('admin');
        if (!adminIdentity) {
            throw Error('An identity for the admin user "admin" does not exist in the wallet');
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
