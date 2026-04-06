/*
 * ============================================================================
 * FILE: web-app/loaders/crypto-patch.js
 * ============================================================================
 * 
 * PURPOSE:
 *   Enables Hyperledger Fabric SDK 2.x to run on Node.js 20/22/24 (Vercel).
 *   
 * THE PROBLEM:
 *   Fabric SDK uses an old version of 'jsrsasign' that relies on legacy OpenSSL 
 *   behaviors. Node 17+ (OpenSSL 3.0) changed how PEM keys are parsed, causing 
 *   the error: "Failed to parse key from PEM: Error: not supported argument".
 *
 * THE SOLUTION:
 *   This is a "Hot Patch" (Monkey-Patch). We intercept 'jsrsasign.KEYUTIL.getKey'.
 *   If it fails to parse a PEM, we use Node's native 'crypto' module to 
 *   parse it instead, and then convert it back into a format the SDK understands.
 * ============================================================================
 */

const crypto = require('crypto');
const jsrsasign = require('jsrsasign');

// Store the original function so we can fallback to it if needed
const originalGetKey = jsrsasign.KEYUTIL.getKey;

/**
 * Patched KEYUTIL.getKey
 * Intercepts PEM parsing to provide OpenSSL 3.0 compatibility
 */
jsrsasign.KEYUTIL.getKey = function(param, passcode, format) {
    try {
        // Try the original legacy parser first
        return originalGetKey.apply(jsrsasign.KEYUTIL, arguments);
    } catch (e) {
        // If it fails with the "not supported argument" error (typical of Node 17+)
        if (typeof param === 'string' && param.includes('-----BEGIN')) {
            try {
                // Use Node's native crypto module to parse the PEM.
                // Node 20/22/24 handles modern and legacy PEMs perfectly.
                const privateKey = crypto.createPrivateKey(param);
                
                // Export it back to a PKCS#8 format that jsrsasign can finally digest
                const pkcs8Pem = privateKey.export({
                    type: 'pkcs8',
                    format: 'pem'
                });
                
                // Re-run the original parser with the cleaned-up PKCS#8 PEM
                return originalGetKey.call(jsrsasign.KEYUTIL, pkcs8Pem, passcode, format);
            } catch (nativeError) {
                // If even native crypto fails, throw the original error
                throw e;
            }
        }
        // For non-PEM arguments, just throw the original error
        throw e;
    }
};

console.log('🚀 Hyperledger Fabric Crypto Compatibility Patch applied for Node.js ' + process.version);
