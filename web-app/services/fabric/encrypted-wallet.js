const { Wallets } = require('fabric-network');
const crypto = require('crypto');


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
    
    let textParts = text.split(':');
    if (textParts.length !== 3) return text; 

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
        return text; 
    }
}


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
            
            const identityCopy = JSON.parse(JSON.stringify(identity));
            identityCopy.credentials.privateKey = encrypt(identityCopy.credentials.privateKey);
            return originalPut(label, identityCopy);
        }
        return originalPut(label, identity);
    };

    return wallet;
}

module.exports = { getEncryptedWallet, encrypt, decrypt };
