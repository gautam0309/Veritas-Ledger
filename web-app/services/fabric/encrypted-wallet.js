const { Wallets } = require('fabric-network');
const crypto = require('crypto');

// Use environment variable for encryption, derive a 32-byte key
const secret = process.env.EXPRESS_SESSION_SECRET || 'fallback_veritas_secret_2026';
const ENCRYPTION_KEY = crypto.scryptSync(secret, 'veritas_salt', 32);
const IV_LENGTH = 16;

function encrypt(text) {
    if (!text) return text;
    let iv = crypto.randomBytes(IV_LENGTH);
    let cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return iv.toString('hex') + ':' + authTag + ':' + encrypted;
}

function decrypt(text) {
    if (!text) return text;
    // Check if it's actually encrypted with our scheme
    let textParts = text.split(':');
    if (textParts.length !== 3) return text; // Probably unencrypted legacy key

    try {
        let iv = Buffer.from(textParts[0], 'hex');
        let authTag = Buffer.from(textParts[1], 'hex');
        let encryptedText = Buffer.from(textParts[2], 'hex');
        let decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (e) {
        return text; // Fallback if decryption fails (e.g., plain text that happens to have colons)
    }
}

/**
 * Returns a Proxy over the FileSystemWallet that dynamically encrypts and decrypts
 * the privateKey component of X.509 identities before they hit the disk.
 */
async function getEncryptedWallet(walletPath) {
    const wallet = await Wallets.newFileSystemWallet(walletPath);

    const originalGet = wallet.get.bind(wallet);
    const originalPut = wallet.put.bind(wallet);

    wallet.get = async function (label) {
        const identity = await originalGet(label);
        if (identity && identity.credentials && identity.credentials.privateKey) {
            identity.credentials.privateKey = decrypt(identity.credentials.privateKey);
        }
        return identity;
    };

    wallet.put = async function (label, identity) {
        if (identity && identity.credentials && identity.credentials.privateKey) {
            // Create a deep copy so we don't mutate the in-memory object used by the caller
            const identityCopy = JSON.parse(JSON.stringify(identity));
            identityCopy.credentials.privateKey = encrypt(identityCopy.credentials.privateKey);
            return originalPut(label, identityCopy);
        }
        return originalPut(label, identity);
    };

    return wallet;
}

module.exports = { getEncryptedWallet, encrypt, decrypt };
