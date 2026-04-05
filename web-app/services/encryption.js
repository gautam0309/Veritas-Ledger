/*
 * ============================================================================
 * FILE: web-app/services/encryption.js
 * ============================================================================
 * 
 * PURPOSE:
 *   The core cryptography engine for the Veritas Ledger.
 *   Handles Merkle Tree generation, Digital Signatures (ECDSA), and 
 *   Verifiable Presentation logic (Generating and Verifying Proofs).
 *
 * KEY CONCEPTS:
 *   - Merkle Tree: A cryptographic tree where every "leaf" is a hashed piece
 *     of data. It allows us to prove that a specific data point (like CGPA)
 *     is part of a certificate WITHOUT revealing the rest of the certificate.
 *   - ECDSA: Elliptic Curve Digital Signature Algorithm. Used by Bitcoin and
 *     Hyperledger Fabric. We use it here to let universities "sign" certificates.
 * ============================================================================
 */

// WHAT: A pure JavaScript cryptography library used for ECDSA signatures
const jsrs = require('jsrsasign');

// WHAT: Library for constructing Merkle Trees and generating Multi-Proofs
const { MerkleTree } = require('merkletreejs');

// WHAT: Standard SHA-256 hashing algorithm
const SHA256 = require('crypto-js/sha256');

const chaincode = require('./fabric/chaincode');
const { getEncryptedWallet } = require('./fabric/encrypted-wallet');
const config = require('../loaders/config');
const certificates = require('../database/models/certificates');

// Initialize the Elliptic Curve context. secp256r1 is the standard curve used by Fabric.
let ecdsa = new jsrs.ECDSA({ 'curve': 'secp256r1' });

// Simple in-memory cache for the certificate schema so we don't query the blockchain every time.
let schemaCache = {};


/**
 * Generate merkle tree from certificate data using a pre-defined schema
 * @param {certificates} certData
 * @returns {Promise<MerkleTree>}
 */

/*
 * ===== FUNCTION: generateMerkleTree =====
 * WHAT: Takes a JSON certificate object and converts it into a cryptographic Merkle Tree.
 */
async function generateMerkleTree(certData) {
    let cacheKey = certData.universityEmail + "_v1";
    let certSchema;

    // 1. Get the Schema
    // WHY: A hash changes if the order of data changes. {"name":"A", "age":1} hashes 
    //   differently than {"age":1, "name":"A"}. We must force strict ordering based
    //   on the smart contract schema.
    if (schemaCache[cacheKey]) {
        certSchema = schemaCache[cacheKey];
    } else {
        certSchema = await chaincode.invokeChaincode("queryCertificateSchema",
            ["v1"], true, certData.universityEmail);
        schemaCache[cacheKey] = certSchema;
    }

    let certDataArray = [];

    // 2. Build the ordered array
    //certSchema used to order the certificate elements appropriately.
    //ordering[i] = key of i'th item that should go in the certificate array.
    for (let i = 0; i < certSchema.ordering.length; i++) {
        let itemKey = certSchema.ordering[i];
        let value = certData[itemKey];

        // Ensure certUUID is correctly mapped even if coming from Mongoose _id
        if (itemKey === 'certUUID' && !value) {
            value = certData._id ? certData._id.toString() : (certData.certUUID || '');
        }

        certDataArray.push(value);
    }

    // 3. Define the hashing function that the MerkleTree library should use
    function hashFn(x) {
        return Buffer.from(SHA256(x).toString(), 'hex');
    }

    // 4. Hash every single item in the ordered array to create the "leaves" of the tree
    const mTreeLeaves = certDataArray.map(x => hashFn(x.toString()));

    // 5. Construct the actual tree
    const mTree = new MerkleTree(mTreeLeaves, hashFn);

    return mTree;
}

/**
 * Generate merkle tree root from certificate data using a pre-defined schema
 * @param {certificates} certData
 * @returns {Promise<string>}
 */

/*
 * ===== FUNCTION: generateMerkleRoot =====
 * WHAT: A helper that builds the tree and just returns the topmost Root Hash as a hex string.
 * WHY: This Root Hash is the "fingerprint" that gets saved to the blockchain.
 */
async function generateMerkleRoot(certData) {
    let mTree = await generateMerkleTree(certData)
    return mTree.getRoot().toString('hex');
}

/**
 * Sign a String with a private key using Elliptic Curve Digital Signature Algorithm
 * @param stringToSign
 * @param signerEmail
 * @returns {Promise<String>}
 */

/*
 * ===== FUNCTION: createDigitalSignature =====
 * WHAT: Injects the user's private key to digitally sign a string (the Merkle Root).
 * WHY: Proves that the user (university/student) authorized this certificate.
 */
async function createDigitalSignature(stringToSign, signerEmail) {
    
    // Decrypt and load the user's identity from the file system
    const wallet = await getEncryptedWallet(config.fabric.walletPath);
    const identity = await wallet.get(signerEmail);

    if (!identity) {
        throw new Error(`Identity for ${signerEmail} not found in wallet`);
    }

    // Extract private key from X.509 identity
    const privateKeyPEM = identity.credentials.privateKey;

    // Use jsrsasign to read the PEM format and generate an ECDSA signature
    let sig = new jsrs.KJUR.crypto.Signature({ "alg": "SHA256withECDSA" });
    sig.init(privateKeyPEM);
    sig.updateHex(stringToSign);
    let signedData = sig.sign(); // Output is a hexadecimal string

    return signedData;
}

/**
 * Map parameter names to their indexes in certificate ordering schema.
 * @param {String[]} paramsToShare - Name of parameters that are to be shared.
 * @param {String[]} ordering - Order of keys in merkle tree generation. Look at Schema.ordering in chaincode
 * @returns {int[]} Index oof the params to share based on schema ordering. Eg - [2,3]
 *
 * eg
 * Input, paramsToShare: ["departmentName", "cgpa"].
 * ordering: ["universityName", "major", "departmentName", "cgpa"]
 * Output: [2,3]
 *
 */

/*
 * ===== FUNCTION: getParamsIndexArray =====
 * WHAT: Helper to find the numeric index positions of the fields the user wants to share.
 * WHY: Merkle Tree proofs require knowing exactly which leaf nodes (by index) we are proving.
 */
function getParamsIndexArray(paramsToShare, ordering) {

    let paramsToShareIndex = paramsToShare.map((element) => {
        return ordering.findIndex(
            (orderingElement) => { return orderingElement === element; })
    });

    return paramsToShareIndex;
}


/**
 * Generate a merkleTree Proof object.
 * @param {String[]} paramsToShare - Name of parameters that are to be shared.
 * @param {String} certUUID
 * @param {String} studentEmail - Certiificate holder email. Used to invoke chaincode.
 * @returns {Promise<Buffer[]>} proofObject
 */

/*
 * ===== FUNCTION: generateCertificateProof =====
 * WHAT: Zero-Knowledge Proof (ZKP) generation. Creates a mathematical proof that
 *   selected data points are true, without revealing the hidden data points.
 * 
 * SCENARIO: An employer asks for proof of CGPA. The student generates a Proof Object
 *   that only contains the CGPA hash and the required sibling hashes to reconstruct
 *   the Root hash. The employer never sees the "major" or "date" fields.
 */
async function generateCertificateProof(paramsToShare, certUUID, studentEmail) {
    let certSchema = await chaincode.invokeChaincode("queryCertificateSchema",
        ["v1"], true, studentEmail);

    // Fetch the raw data from MongoDB
    let certificateDBData = await certificates.findOne({ "_id": certUUID });

    // Reconstruct the exact tree
    let mTree = await generateMerkleTree(certificateDBData);

    // Get the index or "ordering" of the data to share in the pre-defined schema.
    let paramsToShareIndex = getParamsIndexArray(paramsToShare, certSchema.ordering);

    // BUG FIX (Category 4): Sort ascending, otherwise getMultiProof might throw or return corrupted proofs
    // merkletreejs getMultiProof expects indices to be sorted strictly in ascending order.
    // We must sort the paramsToShareIndex here because they might be requested out of order.
    let sortedIndices = [...paramsToShareIndex].sort((a, b) => a - b);

    // Generate the multi-proof (a bundle of sibling hashes needed to reach the root)
    let multiProof = mTree.getMultiProof(mTree.getHexLayersFlat(), sortedIndices);

    return multiProof;
}


/**
 * Verify Merkle Tree Proof
 * @param {Promise<Buffer[]>} mTreeProof
 * @param {Object} disclosedData - Key value pair containing the disclosed data. Eg - {"attributeName" : "attributeValue" }
 * @param {String} certUUID
 * @returns {Promise<boolean>}
 */

/*
 * ===== FUNCTION: verifyCertificateProof =====
 * WHAT: The Employer side of Zero-Knowledge Proof. Takes the Proof Object and 
 *   the visible data, and tries to reconstruct the Root Hash.
 * IF TRUE: The data wasn't tampered with, AND it perfectly matches the blockchain.
 * IF FALSE: The student forged the data or the proof is broken.
 */
async function verifyCertificateProof(mTreeProof, disclosedData, certUUID) {
    let certSchema = await chaincode.invokeChaincode("queryCertificateSchema",
        ["v1"], true, "admin");
    let certificateDBData = await certificates.findOne({ "_id": certUUID });
    let mTree = await generateMerkleTree(certificateDBData);

    // Split disclosedData object into two separate key and value arrays.
    let disclosedDataParamNames = [];
    let disclosedDataValues = [];

    for (let x in disclosedData) {
        disclosedDataParamNames.push(x);
        disclosedDataValues.push(disclosedData[x]);
    }

    let paramsToShareIndex = getParamsIndexArray(disclosedDataParamNames, certSchema.ordering);

    let mTreeRoot = mTree.getRoot();

    // The hashed pairs must be formatted exactly as expected by merkletreejs
    // We hash the plain-text disclosed data so we can compare it to the proof
    let hashIndexPairs = paramsToShareIndex.map((index, i) => {
        let hashWordArr = SHA256(disclosedDataValues[i].toString());
        return {
            index: index,
            hash: Buffer.from(hashWordArr.toString(), 'hex')
        };
    });

    // BUG FIX (Category 4): Sort the hashIndexPairs by index to ensure sortedIndices 
    // and sortedHashes are in ascending order of index.
    // This is strictly required by merkletreejs.verifyMultiProof.
    hashIndexPairs.sort((a, b) => a.index - b.index);

    let sortedIndices = hashIndexPairs.map(p => p.index);
    let sortedHashes = hashIndexPairs.map(p => p.hash);

    let mTreeDepth = mTree.getDepth();

    if (!mTreeProof || !Array.isArray(mTreeProof)) {
        console.log("Verification failed: Invalid or missing proof array.");
        return false;
    }

    // The actual mathematical verification step
    let verificationSuccess = mTree.verifyMultiProof(mTreeRoot, sortedIndices, sortedHashes, mTreeDepth, mTreeProof);

    console.log("Verification status: " + verificationSuccess);
    return verificationSuccess;
}


module.exports = { generateMerkleRoot, createDigitalSignature, generateCertificateProof, verifyCertificateProof };