'use strict';

const mongoose = require('mongoose');
// WHAT: Lazy-loaded inside functions below to prevent startup crashes on Vercel/Cloud.
// const { Wallets } = require('fabric-network');
const FabricIdentity = require('../../database/models/fabric-identity');
const { encrypt, decrypt } = require('./encrypted-wallet');
const logger = require('../logger');

/**
 * MongoWalletStore
 * 
 * Custom implementation for Hyperledger Fabric WALLET storage using MongoDB.
 * This replaces the standard FileSystemWallet for serverless environments (Vercel).
 * Includes application-level encryption for private keys.
 */
class MongoWalletStore {
    /**
     * Retrieves an identity from MongoDB and decrypts the private key.
     * @param {string} label - The identifier (e.g. 'admin' or user email)
     * @returns {Promise<Buffer | undefined>} - Returns binary buffer of identity if found
     */
    async get(label) {
        try {
            const result = await FabricIdentity.findOne({ label });
            if (!result) return undefined;

            // Identity is stored as a stringified JSON in the record
            const identity = JSON.parse(result.identity);

            // Decrypt the private key before returning to the Fabric SDK
            if (identity && identity.credentials && identity.credentials.privateKey) {
                const decryptedKey = decrypt(identity.credentials.privateKey);
                // SUPER SANITIZATION: Remove any database encoding artifacts
                // This is critical for compatibility with Node native crypto logic
                identity.credentials.privateKey = decryptedKey
                    .replace(/\\n/g, '\n') // Literal \n -> actual newline
                    .replace(/\\r/g, '\r') 
                    .replace(/^"|"$/g, '')  // Remove outer quotes if stringified
                    .trim();
            }

            return Buffer.from(JSON.stringify(identity));
        } catch (err) {
            logger.error(`MongoWalletStore: Failed to get identity ${label}: ${err.message}`);
            return undefined;
        }
    }

    /**
     * Saves or updates an identity in MongoDB with encryption.
     * @param {string} label - The identifier
     * @param {Buffer} identityBuffer - The binary buffer of the identity
     */
    async put(label, identityBuffer) {
        try {
            const identity = JSON.parse(identityBuffer.toString());

            // Create a copy to encrypt without modifying the original in-memory object
            const identityCopy = JSON.parse(JSON.stringify(identity));

            // Encrypt the private key before saving to MongoDB Atlas
            if (identityCopy && identityCopy.credentials && identityCopy.credentials.privateKey) {
                identityCopy.credentials.privateKey = encrypt(identityCopy.credentials.privateKey);
            }

            await FabricIdentity.findOneAndUpdate(
                { label },
                { 
                    identity: JSON.stringify(identityCopy),
                    lastUpdated: Date.now()
                },
                { upsert: true, new: true }
            );
            logger.info(`MongoWalletStore: Securely saved identity ${label} to MongoDB Atlas.`);
        } catch (err) {
            logger.error(`MongoWalletStore: Failed to put identity ${label}: ${err.message}`);
            throw err;
        }
    }

    /**
     * Lists all identity labels in the store.
     * @returns {Promise<string[]>}
     */
    async list() {
        try {
            const identities = await FabricIdentity.find({}, 'label');
            return identities.map(doc => doc.label);
        } catch (err) {
            logger.error(`MongoWalletStore: Failed to list identities: ${err.message}`);
            return [];
        }
    }

    /**
     * Deletes an identity from MongoDB.
     * @param {string} label - The identifier
     */
    async remove(label) {
        try {
            await FabricIdentity.deleteOne({ label });
            logger.info(`MongoWalletStore: Removed identity ${label} from MongoDB.`);
        } catch (err) {
            logger.error(`MongoWalletStore: Failed to remove identity ${label}: ${err.message}`);
            throw err;
        }
    }
}

/**
 * Helper to ensure MongoDB is connected before proceed
 */
async function ensureConnected() {
    if (mongoose.connection.readyState === 1) return;
    if (mongoose.connection.readyState === 2) {
        logger.info("MongoWallet: Waiting for MongoDB connection...");
        await new Promise((resolve) => {
            const timeout = setTimeout(resolve, 5000);
            mongoose.connection.once('connected', () => {
                clearTimeout(timeout);
                resolve();
            });
        });
        return;
    }
    throw new Error("MongoDB not connected. Cannot access Cloud Wallet.");
}

/**
 * Returns a Wallet instance backed by MongoDB
 * @returns {Promise<Wallet>}
 */
async function getMongoWallet() {
    try {
        await ensureConnected();
        const { Wallet, Wallets } = require('fabric-network');
        const store = new MongoWalletStore();
        
        // Support for different fabric-network 2.x versions
        if (Wallets && typeof Wallets.newWallet === 'function') {
            return await Wallets.newWallet(store);
        } else if (typeof Wallet === 'function') {
            return new Wallet(store);
        } else {
            throw new Error('Fabric Network Wallet constructor not found. Check fabric-network version.');
        }
    } catch (err) {
        logger.error(`Failed to create Mongo Wallet: ${err.message}`);
        throw err;
    }
}

module.exports = { getMongoWallet };
