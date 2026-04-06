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
 * Hex Grinder: Recursively cleans and extracts ONLY hex characters if missing headers
 */
function sanitizePem(pem) {
    if (typeof pem !== 'string') return pem;
    
    let cleaned = pem.trim();

    // RECURSIVE QUOTE PEELING: Handle double-quoted or JSON-escaped strings
    while (cleaned.startsWith('"') || cleaned.startsWith('\\"')) {
        const start = cleaned.startsWith('"') ? 1 : 2;
        const end = cleaned.endsWith('"') ? 1 : (cleaned.endsWith('\\"') ? 2 : 0);
        if (end === 0) break; 
        cleaned = cleaned.substring(start, cleaned.length - end);
        cleaned = cleaned.trim();
    }

    // If it has headers, just normalize newlines and return
    if (cleaned.includes('-----BEGIN')) {
        return cleaned.replace(/\\n/g, '\n').replace(/\\r/g, '\r');
    }

    // HEX GRINDER: If no header, extract ONLY valid hex digits (0-9, a-f)
    // This obliterates any hidden BOMs, null bytes, or literal escapes
    const grinder = cleaned.replace(/[^0-9a-fA-F]/g, '');

    // 1. RAW HEX DETECT (D-Value or full DER)
    if (grinder.length > 61) { // 32 bytes (64 chars) +/- common header artifacts
        // CASE: Exact 32-byte D-Value
        if (grinder.length === 64) {
            console.log(`[CRYPTO-BRIDGE] ✅ FORMAT DETECTED: Raw Hex (32-byte D-Value)`);
            const b64url = Buffer.from(grinder, 'hex')
                .toString('base64')
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=/g, '');
            return {
                kty: 'EC',
                crv: 'P-256',
                d: b64url
            };
        }
        
        // CASE: Hex-encoded DER sequence (like 558 chars)
        if (grinder.length > 64) {
            console.log(`[CRYPTO-BRIDGE] ✅ FORMAT DETECTED: Hex-encoded DER (Grinder Success: ${grinder.length} chars)`);
            return Buffer.from(grinder, 'hex');
        }
    }

    // 2. JWK DETECT: If it looks like JSON after peeling
    if (cleaned.startsWith('{')) {
        try {
            console.log(`[CRYPTO-BRIDGE] ✅ FORMAT DETECTED: JWK (JSON Object)`);
            return JSON.parse(cleaned);
        } catch (e) {
            console.warn(`[CRYPTO-BRIDGE] ⚠️ JWK PARSE FAILED: Trying as raw string...`);
        }
    }

    // PEM HEADER RECOVERY: Node.js 18+ is strict about SEC1 vs PKCS#8
    if (!cleaned.includes('-----BEGIN')) {
        console.warn(`[CRYPTO-BRIDGE] ⚠️ MISSING HEADER. Applying Brute-Force Wrap...`);
        // If it looks like base64 bits, wrap it
        if (/^[a-zA-Z0-9+/= \n\r]+$/.test(cleaned.replace(/\s/g, ''))) {
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
        if (!pem) return originalCreateKey.call(this, pem);

        const rawPem = Buffer.from(pem).toString();
        const cleanPem = sanitizePem(rawPem);

        try {
            console.log(`[CRYPTO-BRIDGE] 🛠️ NATIVE_LOAD: Attempting native parse...`);
            
            let options = cleanPem;
            
            // Handle Buffer (DER/Binary)
            if (Buffer.isBuffer(cleanPem)) {
                // Node's createPrivateKey with Buffer defaults to DER format
                options = cleanPem;
            } 
            // Handle JWK Object format
            else if (typeof cleanPem === 'object' && cleanPem !== null) {
                options = { key: cleanPem, format: 'jwk' };
            }

            const privateKey = crypto.createPrivateKey(options);
            
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
            // DEEP TELEMETRY: Show more HEX signature if parse fails
            const sample = rawPem.substring(0, 20);
            const hexSample = Buffer.from(sample).toString('hex');
            console.error(`[CRYPTO-BRIDGE] ❌ NATIVE_LOAD FAILED! Err: ${e.message}`);
            console.error(`[CRYPTO-BRIDGE] 🔍 Telemetry: Length=${rawPem.length}, HexSample=${hexSample}`);
            
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
