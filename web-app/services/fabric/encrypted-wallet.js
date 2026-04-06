// WHAT: The Fabric SDK dependencies are now loaded LAZILY inside functions.
// WHY: In cloud environments (Vercel), these modules can fail during startup.
// const { Wallets } = require('fabric-network');
const crypto = require('crypto');

/*
 * ============================================================================
 * FILE: web-app/services/fabric/encrypted-wallet.js
 * ============================================================================
 * 
 * PURPOSE:
 *   Acts as a security proxy layer over the standard Fabric FileSystemWallet.
 *   Automatically encrypts private keys before saving them to disk (wallet/ directory)
 *   and decrypts them right before they are used to sign transactions.
 *
 * WHY IT MATTERS (Category 3 Security Fix):
 *   By default, the Fabric SDK stores private keys in plain text JSON files.
 *   If a server is compromised, hackers can steal these keys and masquerade as users.
 *   This script ensures "encryption at rest" for all blockchain credentials.
 * ============================================================================
 */


// Use environment variable for encryption, derive a 32-byte key
// WHAT: Retrieve the master secret from config, or use a fallback for dev
const secret = process.env.EXPRESS_SESSION_SECRET || 'fallback_veritas_secret_2026';

// WHAT: Derive a strong 32-byte cryptographic key using scrypt
// WHY: AES-256-GCM requires exactly 32 bytes for the key
const ENCRYPTION_KEY = crypto.scryptSync(secret, 'veritas_salt', 32);

// Initialization Vector length for AES
const IV_LENGTH = 16;

/*
 * ===== FUNCTION: encrypt =====
 * WHAT: Encrypts a plain text string using AES-256-GCM (Authenticated Encryption).
 * RETURNS: A concatenated string format: "iv:authTag:encryptedData"
 */
function encrypt(text) {
    if (!text) return text;
    // Generate a random IV for every encryption to ensure uniqueness
    let iv = crypto.randomBytes(IV_LENGTH);
    // Create the cipher using the derived key and random IV
    let cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // GCM provides an Auth Tag to detect tampering (integrity check)
    const authTag = cipher.getAuthTag().toString('hex');
    
    return iv.toString('hex') + ':' + authTag + ':' + encrypted;
}

/*
 * ===== FUNCTION: decrypt =====
 * WHAT: Reverses the encryption process. Parses the custom format and decrypts.
 * MODIFICATION (Phase 24): RECURSIVE DECRYPTION. 
 * If a key was double-encrypted, it continues "peeling" until the raw key is reached.
 */
function decrypt(text) {
    if (!text || typeof text !== 'string') return text;
    
    let current = text;
    let layers = 0;
    
    // Recursive Peeling Loop: continue as long as it looks like iv:tag:ciphertext
    while (current.split(':').length === 3 && layers < 5) {
        let textParts = current.split(':');
        try {
            let iv = Buffer.from(textParts[0], 'hex');
            let authTag = Buffer.from(textParts[1], 'hex');
            let encryptedText = Buffer.from(textParts[2], 'hex');
            
            let decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
            decipher.setAuthTag(authTag);
            
            let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            current = decrypted;
            layers++;
        } catch (e) {
            // Stop peeling if a layer can't be decrypted (e.g. invalid tag)
            break; 
        }
    }
    
    if (layers > 1) {
        console.log(`[CRYPTO-WALLET] ✅ Recursive decryption handled ${layers} layers.`);
    }
    
    return current;
}

/**
 * Returns a Proxy over the FileSystemWallet that dynamically encrypts and decrypts
 * the privateKey component of X.509 identities before they hit the disk.
 */

/*
 * ===== FUNCTION: getEncryptedWallet =====
 * WHAT: The "Proxy" function. It intercepts calls to `wallet.get()` and `wallet.put()`.
 * DESIGN PATTERN: Decorator / Proxy pattern.
 */
async function getEncryptedWallet(walletPath) {
    // 1. Create standard plain-text wallet
    // WHAT: Lazy load the Fabric SDK factory
    const { Wallets } = require('fabric-network');
    const wallet = await Wallets.newFileSystemWallet(walletPath);

    // 2. Save original read/write functions
    const originalGet = wallet.get.bind(wallet);
    const originalPut = wallet.put.bind(wallet);

    // 3. Override .get() to decrypt on the fly
    wallet.get = async function (label) {
        const identity = await originalGet(label); // Read from disk
        // If it's a valid identity, decrypt the privateKey field only
        if (identity && identity.credentials && identity.credentials.privateKey) {
            identity.credentials.privateKey = decrypt(identity.credentials.privateKey);
        }
        return identity; // Return plain text identity to the application memory
    };

    // 4. Override .put() to encrypt on the fly
    wallet.put = async function (label, identity) {
        if (identity && identity.credentials && identity.credentials.privateKey) {
            // Create a deep copy using JSON parse/stringify
            // WHY? We don't want to accidentally encrypt the identity object that the
            // calling application is currently using in RAM. We only want to encrypt 
            // the copy that goes to the hard drive.
            const identityCopy = JSON.parse(JSON.stringify(identity));
            
            // Encrypt just the private key
            identityCopy.credentials.privateKey = encrypt(identityCopy.credentials.privateKey);
            
            // Hand off to the original function to save the encrypted version
            return originalPut(label, identityCopy);
        }
        // If no private key (e.g., admin certs without private keys sometimes), just save
        return originalPut(label, identity);
    };

    return wallet;
}

module.exports = { getEncryptedWallet, encrypt, decrypt };
