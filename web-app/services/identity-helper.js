'use strict';

/*
 * ============================================================================
 * FILE: web-app/services/identity-helper.js
 * ============================================================================
 * 
 * PURPOSE:
 *   Identity Synchronization and Self-Healing.
 *   Solves a major edge case where a user exists in MongoDB but their 
 *   cryptographic wallet file was deleted from the local disk.
 *
 * HOW IT WORKS:
 *   - Automatically intercepts missing wallets during login.
 *   - Calls the Fabric CA to re-create the missing keys.
 *   - Allows developers to clear the wallet folder without destroying all
 *     existing user accounts.
 * ============================================================================
 */


const fabricEnrollment = require('./fabric/enrollment');
const { getEncryptedWallet } = require('./fabric/encrypted-wallet');
const config = require('../loaders/config');
const logger = require('./logger');

/**
 * Ensures that a user's identity exists in the wallet.
 * If missing, it attempts to re-enroll the user.
 * 
 * @param {string} email - The user's email/enrollment ID
 * @returns {Promise<boolean>} - True if identity exists or was successfully restored
 */

/*
 * ===== FUNCTION: ensureIdentity =====
 * WHAT: The self-healing wrapper.
 */
async function ensureIdentity(email) {
    try {
        // Open the wallet store
        const wallet = await getEncryptedWallet(config.fabric.walletPath);
        const identity = await wallet.get(email);

        // Standard case: User's crypto files exist on disk.
        if (identity) {
            return true;
        }

        // Edge case: Database login succeeded, but wallet is missing!
        logger.info(`Identity for ${email} missing from wallet. Attempting self-healing re-enrollment...`);
        
        // Attempt to re-register/re-enroll the user automatically against the CA
        try {
            await fabricEnrollment.registerUser(email);
        } catch (regError) {
            // Identity removal is often disabled in production/v1.4 CA setups.
            // If it exists in CA but we have no wallet, we are stuck for this ID 
            // unless we have the CA root admin secret. We'll log it clearly.
            if (regError.message && regError.message.includes('already registered')) {
                logger.warn(`Identity ${email} is already registered in CA, but wallet is missing. Automatic recovery impossible for this specific ID without full CA reset.`);
                return false; 
            } else {
                throw regError;
            }
        }
        
        logger.info(`Successfully restored identity for ${email} to wallet.`);
        return true;
    } catch (error) {
        logger.error(`Self-healing failed for ${email}: ${error.message}`);
        return false;
    }
}

module.exports = { ensureIdentity };
