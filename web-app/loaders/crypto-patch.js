/*
 * ============================================================================
 * FILE: web-app/loaders/crypto-patch.js - GLOBAL INTERCEPTOR VERSION
 * ============================================================================
 */

const crypto = require('crypto');
const Module = require('module');

// Store the original Node.js module loader
const originalRequire = Module.prototype.require;

/**
 * Patch function for a specific jsrsasign instance
 */
function patchJsrsasign(jsrsasign) {
    if (!jsrsasign || !jsrsasign.KEYUTIL || jsrsasign.__antigravity_patched) return;

    const originalGetKey = jsrsasign.KEYUTIL.getKey;

    jsrsasign.KEYUTIL.getKey = function(param, passcode, format) {
        try {
            // Attempt standard logic
            return originalGetKey.apply(jsrsasign.KEYUTIL, arguments);
        } catch (e) {
            // If it fails with the Node 18+ crypto incompatibility error
            if (typeof param === 'string' && param.includes('-----BEGIN')) {
                console.log(`[CRYPTO-PATCH] 🛡️ INTERCEPTED: Intercepting PEM parsing failure. Falling back to native crypto.`);
                try {
                    // Use modern Node's native crypto to re-hydrate the PEM
                    const privateKey = crypto.createPrivateKey(param);
                    const pkcs8Pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
                    
                    // Return the result of the original parser using our cleaned PKCS#8
                    return originalGetKey.call(jsrsasign.KEYUTIL, pkcs8Pem, passcode, format);
                } catch (nativeExc) {
                    console.error(`[CRYPTO-PATCH] ❌ FAILED: Native fallback failed:`, nativeExc.message);
                    throw e; // Throw original error if fallback also fails
                }
            }
            throw e;
        }
    };

    jsrsasign.__antigravity_patched = true;
    console.log(`[CRYPTO-PATCH] ✅ SUCCESS: Global patch applied to a jsrsasign instance.`);
}

/**
 * Global Interceptor: Catch EVERY attempt to require jsrsasign
 */
Module.prototype.require = function(request) {
    const result = originalRequire.apply(this, arguments);

    // Resolve if this is a jsrsasign request (root or nested)
    if (request === 'jsrsasign' || request.endsWith('/jsrsasign')) {
        patchJsrsasign(result);
    }

    return result;
};

console.log('🚀 [CRYPTO-PATCH] Global Module Interceptor ACTIVE for Node.js ' + process.version);
