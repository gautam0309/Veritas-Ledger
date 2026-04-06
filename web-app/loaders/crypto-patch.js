/*
 * ============================================================================
 * FILE: web-app/loaders/crypto-patch.js - NATIVE BRIDGE VERSION (PHASE 9)
 * ============================================================================
 */

const crypto = require('crypto');
const Module = require('module');

// Store the original Node.js module loader
const originalRequire = Module.prototype.require;

/**
 * Patch function for a specific jsrsasign instance
 */
function patchJsrsasign(jsrsasign, source) {
    if (!jsrsasign || !jsrsasign.KEYUTIL || jsrsasign.__antigravity_patched) return;

    const originalGetKey = jsrsasign.KEYUTIL.getKey;

    jsrsasign.KEYUTIL.getKey = function(param, passcode, format) {
        try {
            return originalGetKey.apply(jsrsasign.KEYUTIL, arguments);
        } catch (e) {
            if (typeof param === 'string' && param.includes('-----BEGIN')) {
                console.log(`[CRYPTO-BRIDGE] 🛡️ KEYUTIL Intercepted: Parsing failed, falling back to native.`);
                try {
                    const privateKey = crypto.createPrivateKey(param);
                    const pkcs8Pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
                    return originalGetKey.call(jsrsasign.KEYUTIL, pkcs8Pem, passcode, format);
                } catch (nativeExc) {
                    throw e; 
                }
            }
            throw e;
        }
    };

    jsrsasign.__antigravity_patched = true;
    console.log(`[CRYPTO-BRIDGE] ✅ JS-LEVEL: Patched a jsrsasign/KEYUTIL instance from: ${source || 'unknown'}.`);
}

/**
 * Super Sanitizer: Cleans PEM strings from any DB, JSON, or formatting artifacts
 */
function sanitizePem(pem) {
    if (typeof pem !== 'string') return pem;
    
    let cleaned = pem
        .replace(/\\n/g, '\n') // Literal \n -> actual newline
        .replace(/\\r/g, '\r') // Literal \r -> carriage return
        .replace(/^"|"$/g, '')  // Remove outer quotes if stringified
        .trim();

    // Ensure it has valid PEM headers
    if (!cleaned.includes('-----BEGIN')) {
        console.warn(`[CRYPTO-BRIDGE] ⚠️ SANITIZER: Key missing header. Attempting recovery...`);
        // If it looks like base64 but is missing headers, wrap it as a Private Key
        if (/^[a-zA-Z0-9+/= \n]+$/.test(cleaned)) {
            cleaned = `-----BEGIN PRIVATE KEY-----\n${cleaned}\n-----END PRIVATE KEY-----`;
        }
    }
    
    return cleaned;
}

/**
 * Native Bridge: Patches the CryptoSuite_ECDSA_AES class directly to skip jsrsasign entirely
 */
function patchCryptoSuite(CryptoSuiteClass) {
    if (!CryptoSuiteClass || !CryptoSuiteClass.prototype || CryptoSuiteClass.__antigravity_patched) return;

    console.log(`[CRYPTO-BRIDGE] ⚙️ SDK-LEVEL: Found CryptoSuite_ECDSA_AES. Applying Native Bridge...`);
    
    const originalCreateKey = CryptoSuiteClass.prototype.createKeyFromRaw;
    CryptoSuiteClass.prototype.createKeyFromRaw = function(pem) {
        // Step 1: Force to string and SANITIZE
        const rawPem = Buffer.from(pem).toString();
        const cleanPem = sanitizePem(rawPem);

        try {
            console.log(`[CRYPTO-BRIDGE] 🛠️ NATIVE_LOAD: Attempting native parse...`);
            const privateKey = crypto.createPrivateKey(cleanPem);
            
            const nativeKey = {
                type: 'EC',
                prvKeyHex: '',
                ecparams: { name: this._curveName || 'secp256r1' },
                __nativeKey: privateKey,
                __isNative: true
            };
            
            const ECDSAKey = require('./ecdsa/key.js');
            console.log(`[CRYPTO-BRIDGE] ✅ NATIVE_LOAD SUCCESS.`);
            return new ECDSAKey(nativeKey);
        } catch (e) {
            console.warn(`[CRYPTO-BRIDGE] ⚠️ NATIVE_LOAD FAILED: Falling back to original logic. Error:`, e.message);
            // Before falling back, try one last time with the raw string
            return originalCreateKey.call(this, cleanPem);
        }
    };

    // Override sign to use Node native sign()
    const originalSign = CryptoSuiteClass.prototype.sign;
    CryptoSuiteClass.prototype.sign = function(key, digest) {
        if (key && key._key && key._key.__isNative) {
            try {
                console.log(`[CRYPTO-BRIDGE] 🖊️ NATIVE_SIGN: Performing native ECDSA signature...`);
                // Perform a native ECDSA signature with Node's crypto
                const signature = crypto.sign(
                    null, // algorithm (null for EC signatures where we just need the raw signature)
                    digest,
                    key._key.__nativeKey
                );
                return signature;
            } catch (e) {
                console.error(`[CRYPTO-BRIDGE] ❌ NATIVE_SIGN FAILED:`, e.message);
                throw e;
            }
        }
        return originalSign.apply(this, arguments);
    };

    CryptoSuiteClass.__antigravity_patched = true;
    console.log(`[CRYPTO-BRIDGE] ✅ SDK-LEVEL: Native Bridge ACTIVE.`);
}

/**
 * Universal Interceptor
 */
Module.prototype.require = function(request) {
    const result = originalRequire.apply(this, arguments);

    // 1. Catch jsrsasign (Legacy/Nested)
    if (result && result.KEYUTIL) {
        patchJsrsasign(result, request);
    }

    // 2. Catch the Fabric SDK CryptoSuite itself
    if (request.endsWith('CryptoSuite_ECDSA_AES.js') || (result && result.name === 'CryptoSuite_ECDSA_AES')) {
        patchCryptoSuite(result);
    }

    return result;
};

console.log('🚀 [CRYPTO-BRIDGE] Native Crypto Bridge Interceptor ACTIVE for Node.js ' + process.version);
