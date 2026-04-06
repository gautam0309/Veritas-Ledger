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
 * Adaptive Sanitizer: Neutralizes database encoding artifacts and restores format.
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

    // Normalized newlines
    cleaned = cleaned.replace(/\\n/g, '\n').replace(/\\r/g, '\r');

    // If it's a raw hex key (558 chars or more of hex), convert to buffer
    // WHY: Modern Node crypto prefers buffers for DER-formatted keys.
    if (/^[0-9a-fA-F:\-]+$/.test(cleaned) && cleaned.length > 61) {
         const hexData = cleaned.replace(/[:\-]/g, '');
         return Buffer.from(hexData, 'hex');
    }

    return cleaned;
}

/**
 * Native Bridge: Patches the CryptoSuite_ECDSA_AES class directly to skip jsrsasign entirely
 */
function patchCryptoSuite(CryptoSuiteClass, registry) {
    if (!CryptoSuiteClass || !CryptoSuiteClass.prototype || CryptoSuiteClass.__antigravity_patched) return;

    console.log(`[CRYPTO-BRIDGE] ⚙️ SDK-LEVEL: Found CryptoSuite_ECDSA_AES. Applying Native Bridge...`);
    
    const originalCreateKey = CryptoSuiteClass.prototype.createKeyFromRaw;
    CryptoSuiteClass.prototype.createKeyFromRaw = function(pem) {
        if (!pem) return originalCreateKey.call(this, pem);

        const rawPem = Buffer.from(pem).toString();
        const cleanPem = sanitizePem(rawPem);

        // Dependency Resolution: Use captured ECDSAKey if available, otherwise try relative
        const ECDSAKey = registry.ECDSAKey || require('./ecdsa/key.js');

        try {
            console.log(`[CRYPTO-BRIDGE] 🛠️ NATIVE_LOAD: Attempting native pkcs8...`);
            const options = Buffer.isBuffer(cleanPem) ? { key: cleanPem, format: 'der', type: 'pkcs8' } : cleanPem;
            const privateKey = crypto.createPrivateKey(options);
            
            const nativeKey = {
                type: 'EC',
                prvKeyHex: '',
                ecparams: { name: this._curveName || 'secp256r1' },
                __nativeKey: privateKey,
                __isNative: true
            };
            
            console.log(`[CRYPTO-BRIDGE] ✅ NATIVE_LOAD SUCCESS (PKCS#8).`);
            return new ECDSAKey(nativeKey);
        } catch (e) {
            try {
                console.log(`[CRYPTO-BRIDGE] ⚙️ SEC1 Fallback: Trying native sec1...`);
                const options = Buffer.isBuffer(cleanPem) ? { key: cleanPem, format: 'der', type: 'sec1' } : cleanPem;
                const privateKey = crypto.createPrivateKey(options);
                
                const nativeKey = {
                    type: 'EC',
                    prvKeyHex: '',
                    ecparams: { name: this._curveName || 'secp256r1' },
                    __nativeKey: privateKey,
                    __isNative: true
                };
                
                console.log(`[CRYPTO-BRIDGE] ✅ NATIVE_LOAD SUCCESS (SEC1).`);
                return new ECDSAKey(nativeKey);
            } catch (e2) {
                console.error(`[CRYPTO-BRIDGE] ❌ NATIVE_LOAD FAILED! PKCS8: ${e.message}, SEC1: ${e2.message}`);
                
                // FORENSIC TELEMETRY: Show the FIRST 10 BYTES of the payload to reveal binary structure
                const sampleHex = Buffer.from(cleanPem).toString('hex').substring(0, 20);
                console.error(`[CRYPTO-BRIDGE] 🔍 Forensic Telemetry: Sample="${sampleHex}", Length=${cleanPem.length}`);
                
                // BUFFER SAFETY: If native loader fails, conversion to string prevents jsrsasign crash
                const fallbackPem = Buffer.isBuffer(cleanPem) ? cleanPem.toString('hex') : cleanPem;
                return originalCreateKey.call(this, fallbackPem);
            }
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

// Registry to capture internal Fabric SDK classes that might be moved or flattened by bundlers (Vercel)
const registry = { ECDSAKey: null };

/**
 * Universal Interceptor
 */
Module.prototype.require = function(request) {
    const result = originalRequire.apply(this, arguments);

    // 0. CAPTURE: Internal Fabric SDK dependencies to share with the bridge
    if (request.endsWith('ecdsa/key.js')) {
        registry.ECDSAKey = result;
    }

    // 1. Catch jsrsasign (Legacy/Nested)
    if (result && result.KEYUTIL) {
        patchJsrsasign(result, request);
    }

    // 2. Catch the Fabric SDK CryptoSuite itself
    if (request.endsWith('CryptoSuite_ECDSA_AES.js') || (result && result.name === 'CryptoSuite_ECDSA_AES')) {
        patchCryptoSuite(result, registry);
    }

    return result;
};

console.log('🚀 [CRYPTO-BRIDGE] Native Crypto Bridge Interceptor ACTIVE for Node.js ' + process.version);
