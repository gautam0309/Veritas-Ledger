const jsrs = require('jsrsasign');
const { MerkleTree } = require('merkletreejs');
const SHA256 = require('crypto-js/sha256');
const chaincode = require('./fabric/chaincode');
const { getEncryptedWallet } = require('./fabric/encrypted-wallet');
const config = require('../loaders/config');
const certificates = require('../database/models/certificates');

let ecdsa = new jsrs.ECDSA({ 'curve': 'secp256r1' });
let schemaCache = {};



async function generateMerkleTree(certData) {
    let cacheKey = certData.universityEmail + "_v1";
    let certSchema;

    if (schemaCache[cacheKey]) {
        certSchema = schemaCache[cacheKey];
    } else {
        certSchema = await chaincode.invokeChaincode("queryCertificateSchema",
            ["v1"], true, certData.universityEmail);
        schemaCache[cacheKey] = certSchema;
    }

    let certDataArray = [];

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

    function hashFn(x) {
        return Buffer.from(SHA256(x).toString(), 'hex');
    }

    const mTreeLeaves = certDataArray.map(x => hashFn(x.toString()));

    const mTree = new MerkleTree(mTreeLeaves, hashFn);

    return mTree;
}


async function generateMerkleRoot(certData) {
    let mTree = await generateMerkleTree(certData)
    return mTree.getRoot().toString('hex');
}


async function createDigitalSignature(stringToSign, signerEmail) {
    const wallet = await getEncryptedWallet(config.fabric.walletPath);
    const identity = await wallet.get(signerEmail);

    if (!identity) {
        throw new Error(`Identity for ${signerEmail} not found in wallet`);
    }

    // Extract private key from X.509 identity
    const privateKeyPEM = identity.credentials.privateKey;

    // Use jsrsasign to read the PEM and sign
    let sig = new jsrs.KJUR.crypto.Signature({ "alg": "SHA256withECDSA" });
    sig.init(privateKeyPEM);
    sig.updateHex(stringToSign);
    let signedData = sig.sign();

    return signedData;
}


function getParamsIndexArray(paramsToShare, ordering) {

    let paramsToShareIndex = paramsToShare.map((element) => {
        return ordering.findIndex(
            (orderingElement) => { return orderingElement === element; })
    });

    return paramsToShareIndex;
}



async function generateCertificateProof(paramsToShare, certUUID, studentEmail) {
    let certSchema = await chaincode.invokeChaincode("queryCertificateSchema",
        ["v1"], true, studentEmail);

    let certificateDBData = await certificates.findOne({ "_id": certUUID });

    let mTree = await generateMerkleTree(certificateDBData);

    //get the index or "ordering" of the data to share in the pre defined schema.
    let paramsToShareIndex = getParamsIndexArray(paramsToShare, certSchema.ordering);

    // Sort ascending, otherwise getMultiProof might throw or return corrupted proofs
    // merkletreejs getMultiProof expects indices to be sorted strictly in ascending order.
    // We must sort the paramsToShareIndex here because they might be requested out of order.
    let sortedIndices = [...paramsToShareIndex].sort((a, b) => a - b);

    let multiProof = mTree.getMultiProof(mTree.getHexLayersFlat(), sortedIndices);

    return multiProof;
}



async function verifyCertificateProof(mTreeProof, disclosedData, certUUID) {
    let certSchema = await chaincode.invokeChaincode("queryCertificateSchema",
        ["v1"], true, "admin");
    let certificateDBData = await certificates.findOne({ "_id": certUUID });
    let mTree = await generateMerkleTree(certificateDBData);

    //Split disclosedData object into two separate key and value arrays.
    let disclosedDataParamNames = [];
    let disclosedDataValues = [];

    for (let x in disclosedData) {
        disclosedDataParamNames.push(x);
        disclosedDataValues.push(disclosedData[x]);
    }

    let paramsToShareIndex = getParamsIndexArray(disclosedDataParamNames, certSchema.ordering);

    let mTreeRoot = mTree.getRoot();

    // The hashed pairs must be formatted exactly as expected by merkletreejs
    let hashIndexPairs = paramsToShareIndex.map((index, i) => {
        let hashWordArr = SHA256(disclosedDataValues[i].toString());
        return {
            index: index,
            hash: Buffer.from(hashWordArr.toString(), 'hex')
        };
    });

    // Sort the hashIndexPairs by index to ensure sortedIndices and sortedHashes are in ascending order of index
    // This is required by merkletreejs.verifyMultiProof
    hashIndexPairs.sort((a, b) => a.index - b.index);

    let sortedIndices = hashIndexPairs.map(p => p.index);
    let sortedHashes = hashIndexPairs.map(p => p.hash);

    let mTreeDepth = mTree.getDepth();

    if (!mTreeProof || !Array.isArray(mTreeProof)) {
        console.log("Verification failed: Invalid or missing proof array.");
        return false;
    }

    let verificationSuccess = mTree.verifyMultiProof(mTreeRoot, sortedIndices, sortedHashes, mTreeDepth, mTreeProof);

    console.log("Verification status: " + verificationSuccess);
    return verificationSuccess;
}


module.exports = { generateMerkleRoot, createDigitalSignature, generateCertificateProof, verifyCertificateProof };