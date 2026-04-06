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
    
    // NUCLEAR ASCII CLEAN: Remove all non-printable or control characters except NL/CR
    // WHY: MongoDB Atlas strings sometimes contain invisible binary artifacts or UTF-16 residues.
    let cleaned = pem.replace(/[^\x20-\x7E\r\n]/g, '').trim();

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
    
    /**
     * Internal Helper: Wraps a native key (private OR public) with Fabric SDK metadata (PubKeyHex, XY points).
     * Certificates are legitimately passed here by the SDK to extract the public key for verification.
     */
    function createHydratedKey(keyObject, ECDSAKey, label) {
        // Determine if this is a private or public key
        const isPrivate = keyObject.type === 'private';
        const publicKey = isPrivate ? crypto.createPublicKey(keyObject) : keyObject;
        const pubJwk = publicKey.export({ format: 'jwk' });
        const x = Buffer.from(pubJwk.x, 'base64url');
        const y = Buffer.from(pubJwk.y, 'base64url');
        const pubKeyHex = Buffer.concat([Buffer.from([0x04]), x, y]).toString('hex');

        // Extract the REAL private key hex from JWK for jsrsasign compatibility
        let prvKeyHex = null;
        if (isPrivate) {
            const privJwk = keyObject.export({ format: 'jwk' });
            prvKeyHex = Buffer.from(privJwk.d, 'base64url').toString('hex');
        }

        // Export the private key PEM for wallet serialization (toBytes)
        const privatePem = isPrivate ? keyObject.export({ type: 'pkcs8', format: 'pem' }) : null;

        // Build a key object that jsrsasign's ECDSA can work with directly
        const nativeKey = {
            type: 'EC',
            pubKeyHex: pubKeyHex,
            prvKeyHex: prvKeyHex, // REAL hex = jsrsasign ECDSA.sign() works natively with low-S
            curveName: 'secp256r1',
            ecparams: { name: 'secp256r1', keylen: 256 },
            getPublicKeyXYHex: () => ({ x: x.toString('hex'), y: y.toString('hex') }),
            __nativeKey: isPrivate ? keyObject : null,
            __privatePem: privatePem
        };
        
        console.log(`[CRYPTO-BRIDGE] ✅ HYDRATED SUCCESS (${label}). PubKeyHex=${pubKeyHex.substring(0, 10)}...`);
        const ecdsaKey = new ECDSAKey(nativeKey);

        // Override toBytes() so wallet serialization exports the real PEM
        if (isPrivate && privatePem) {
            ecdsaKey.toBytes = function() { return privatePem; };
        }

        return ecdsaKey;
    }

    const originalCreateKey = CryptoSuiteClass.prototype.createKeyFromRaw;
    CryptoSuiteClass.prototype.createKeyFromRaw = function(pem) {
        if (!pem) return originalCreateKey.call(this, pem);

        const rawPem = Buffer.from(pem).toString();
        const cleanPem = sanitizePem(rawPem);

        // Dependency Resolution: Use captured ECDSAKey if available, otherwise try relative
        const ECDSAKey = registry.ECDSAKey || require('./impl/ecdsa/key.js');

        // 1. TRY CERTIFICATE (For Admin or Pub-Only identities)
        if (typeof cleanPem === 'string' && cleanPem.includes('-----BEGIN CERTIFICATE-----')) {
            try {
                console.log(`[CRYPTO-BRIDGE] 🛠️ NATIVE_LOAD: Detected Certificate... Extracting Public Key.`);
                const publicKey = crypto.createPublicKey(cleanPem);
                return createHydratedKey(publicKey, ECDSAKey, 'CERT-PUB');
            } catch (eCert) {
                console.error(`[CRYPTO-BRIDGE] ❌ CERT-LOAD FAILED: ${eCert.message}`);
            }
        }

        // 2. TRY RAW PRIVATE KEY (Most robust for legacy keys like Admin)
        if (typeof cleanPem === 'string') {
            try {
                console.log(`[CRYPTO-BRIDGE] 🛠️ NATIVE_LOAD: Attempting raw PEM load...`);
                const privateKey = crypto.createPrivateKey(cleanPem);
                return createHydratedKey(privateKey, ECDSAKey, 'RAW-PEM');
            } catch (e) {}
        }

        // 3. TRY PKCS#8 (Standard for decrypted student keys)
        try {
            console.log(`[CRYPTO-BRIDGE] 🛠️ NATIVE_LOAD: Attempting native pkcs8...`);
            const options = Buffer.isBuffer(cleanPem) ? { key: cleanPem, format: 'der', type: 'pkcs8' } : cleanPem;
            const privateKey = crypto.createPrivateKey(options);
            return createHydratedKey(privateKey, ECDSAKey, 'PKCS#8');
        } catch (e) {
            // 4. TRY SEC1 Fallback
            try {
                console.log(`[CRYPTO-BRIDGE] ⚙️ SEC1 Fallback: Trying native sec1...`);
                const options = Buffer.isBuffer(cleanPem) ? { key: cleanPem, format: 'der', type: 'sec1' } : cleanPem;
                const privateKey = crypto.createPrivateKey(options);
                return createHydratedKey(privateKey, ECDSAKey, 'SEC1');
            } catch (e2) {
                console.error(`[CRYPTO-BRIDGE] ❌ NATIVE_LOAD FAILED! Raw/PKCS8/SEC1 aborted. Sample=${Buffer.from(cleanPem).toString('hex').substring(0, 20)}`);
                if (cleanPem && cleanPem.length > 50) {
                    console.error(`[CRYPTO-BRIDGE] 🔍 CRITICAL FORENSIC (Key Length ${cleanPem.length}):`);
                    console.error(`[CRYPTO-BRIDGE] HEX_START: ${Buffer.from(cleanPem).toString('hex').substring(0, 64)}`);
                    console.error(`[CRYPTO-BRIDGE] HEX_END:   ${Buffer.from(cleanPem).toString('hex').slice(-64)}`);
                }
                const fallbackPem = Buffer.isBuffer(cleanPem) ? cleanPem.toString('hex') : cleanPem;
                return originalCreateKey.call(this, fallbackPem);
            }
        }
    };

    // NOTE: We do NOT override sign() anymore. By providing real prvKeyHex,
    // the original SDK signer (jsrsasign ECDSA + _preventMalleability) works correctly.

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

    // 3. Catch ServiceEndpoint (The Ghost Timeout)
    if (request.endsWith('ServiceEndpoint.js') || (result && result.name === 'ServiceEndpoint')) {
        patchServiceEndpoint(result);
    }

    return result;
};

/**
 * Global ServiceEndpoint Timeout Hook: Overrides the hardcoded 3000ms SDK limit.
 */
function patchServiceEndpoint(ServiceEndpointClass) {
    if (!ServiceEndpointClass || !ServiceEndpointClass.prototype || ServiceEndpointClass.__antigravity_patched) return;

    const originalWaitForReady = ServiceEndpointClass.prototype.waitForReady;
    ServiceEndpointClass.prototype.waitForReady = function() {
        if (this.options) {
            // THE GHOST TIMEOUT: Fabric defaults to 3000ms if not specified or too low.
            const currentTimeout = this.options['grpc-wait-for-ready-timeout'] || 3000;
            if (currentTimeout < 20000) {
                console.log(`[CRYPTO-BRIDGE] ⏳ TIMEOUT-HOOK: Increasing waitForReady for ${this.name} to 30000ms`);
                this.options['grpc-wait-for-ready-timeout'] = 30000;
            }
        }
        return originalWaitForReady.apply(this, arguments);
    };

    ServiceEndpointClass.__antigravity_patched = true;
    console.log(`[CRYPTO-BRIDGE] ✅ NET-LEVEL: ServiceEndpoint Hook ACTIVE.`);
}

console.log('🚀 [CRYPTO-BRIDGE] Native Crypto Bridge Interceptor ACTIVE for Node.js ' + process.version);
