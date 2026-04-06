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
 * SEC1 Auto-Healer: Recursively cleans, extracts Hex, and heals malformed headers
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
    const grinder = cleaned.replace(/[^0-9a-fA-F]/g, '');

    // 1. BINARY HEALER & forensic PKCS#8 RESTORATION
    if (grinder.length > 61) {
        let buf = Buffer.from(grinder, 'hex');
        
        // CASE: Header-less Binary SEC1/PKCS8 (Does not start with 0x30 SEQUENCE)
        if (buf[0] !== 0x30) {
            // SCENARIO A: Truncated PKCS#8 Sequence (Forensic Restore for 270+ byte blobs)
            if (buf.length > 200) {
                console.log(`[CRYPTO-BRIDGE] ⚙️ TRUNCATED PKCS#8 DETECTED (${buf.length} bytes). Restoring OID Sequence tags...`);
                // Restore the missing "30 82 01 13" (Sequence + Length) header from VPS data
                return Buffer.concat([Buffer.from('30820113', 'hex'), buf]);
            }

            // SCENARIO B: Raw 32-byte Private Key Bits (Deep Reconstruct)
            console.log(`[CRYPTO-BRIDGE] ⚙️ RAW SEC1 DETECTED. Reconstructing PKCS#8 Envelope...`);
            const d_bytes = buf.slice(0, 32);
            const p256Pkcs8Header = Buffer.from([
                0x30, 0x41, 0x02, 0x01, 0x00, 0x30, 0x13, 
                0x06, 0x07, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x02, 0x01, 
                0x06, 0x08, 0x2a, 0x86, 0x48, 0xce, 0x3d, 0x03, 0x01, 0x07, 
                0x04, 0x27, 0x30, 0x25, 0x02, 0x01, 0x01, 0x04, 0x20
            ]);
            return Buffer.concat([p256Pkcs8Header, d_bytes]);
        }
        
        // CASE: Full Hex-encoded DER sequence (Starting with 0x30)
        console.log(`[CRYPTO-BRIDGE] ✅ FORMAT DETECTED: Hex-encoded DER (Grinder Success: ${grinder.length} chars)`);
        return buf;
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
            
            // The Cloak already provides a String (PEM) or Buffer (DER).
            // Pass it directly to ensure universal compatibility with all Node versions.
            // If it's a buffer, we explicitly tell Node it's a DER-formatted PKCS#8 key.
            const options = Buffer.isBuffer(cleanPem) ? { key: cleanPem, format: 'der', type: 'pkcs8' } : cleanPem;
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
            // DEEP TELEMETRY: Show the ACTUAL binary hex of the buffer if parse fails
            const binaryHex = cleanPem instanceof Buffer ? cleanPem.toString('hex').substring(0, 40) : "not-a-buffer";
            console.error(`[CRYPTO-BRIDGE] ❌ NATIVE_LOAD FAILED! Err: ${e.message}`);
            console.error(`[CRYPTO-BRIDGE] 🔍 Telemetry: Length=${rawPem.length}, BinaryHex=${binaryHex}`);
            
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
