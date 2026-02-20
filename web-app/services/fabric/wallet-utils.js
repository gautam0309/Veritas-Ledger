const { Wallets } = require('fabric-network');
const config = require('../../loaders/config');
const fs = require('fs');
const path = require('path');
const logger = require('../logger');

/**
 * Adds a new user/entity to the wallet. Creates a separate json file to store hex keys of the user.
 * @param {FabricCAServices.IEnrollResponse} enrollmentObject
 * @param {String} userName
 * @returns {Promise<{} | Error>} public and private key in hex format;
 */
async function createNewWalletEntity(enrollmentObject, userName) {
    const { getEncryptedWallet } = require('./encrypted-wallet');
    const wallet = await getEncryptedWallet(config.fabric.walletPath);

    const x509Identity = {
        credentials: {
            certificate: enrollmentObject.certificate,
            privateKey: enrollmentObject.key.toBytes(),

        },
        mspId: 'Org1MSP',
        type: 'X.509',
    };


    let hexKeyEntity = {
        publicKey: enrollmentObject.key._key.pubKeyHex,
        privateKey: enrollmentObject.key._key.prvKeyHex,
        userName: userName
    };

    await wallet.put(userName, x509Identity);

    return hexKeyEntity;
}

/**
 * Note: loadHexKeysFromWallet was removed as it relied on insecure cleartext JSON storage.
 * Digital signatures and key management should be handled through the Fabric Network SDK.
 */

module.exports = { createNewWalletEntity };