'use strict';

const FabricCAServices = require('fabric-ca-client');
const { Wallets } = require('fabric-network');
const path = require('path');
const config = require('../../loaders/config');
const fs = require('fs');
const walletUtils = require('./wallet-utils');
const logger = require('../logger');


const ccp = JSON.parse(fs.readFileSync(config.fabric.ccpPath, 'utf8'));


async function enrollAdmin() {
    try {

        
        const caInfo = ccp.certificateAuthorities['ca.org1.example.com'];
        const caTLSCACerts = caInfo.tlsCACerts.pem;
        const ca = new FabricCAServices(caInfo.url, { trustedRoots: caTLSCACerts, verify: false }, caInfo.caName);

        
        const { getEncryptedWallet } = require('./encrypted-wallet');
        const wallet = await getEncryptedWallet(config.fabric.walletPath);

        const identity = await wallet.get('admin');
        if (identity) {
            logger.info('An identity for the admin user "admin" already exists in the wallet.');
            return;
        }

        
        const enrollment = await ca.enroll({ enrollmentID: 'admin', enrollmentSecret: 'adminpw' });
        let adminKeys = await walletUtils.createNewWalletEntity(enrollment, "admin");
        logger.info('Successfully enrolled admin user "admin" and imported it into the wallet.');
        return adminKeys;
    } catch (error) {
        logger.error(`Failed to enroll admin user "admin": ${error}`);
        process.exit(1);
    }
}


async function registerUser(email) {
    try {
        
        const caURL = ccp.certificateAuthorities['ca.org1.example.com'].url;
        const ca = new FabricCAServices(caURL);

        
        const { getEncryptedWallet } = require('./encrypted-wallet');
        const wallet = await getEncryptedWallet(config.fabric.walletPath);

        
        const userIdentity = await wallet.get(email);
        if (userIdentity) {
            throw Error(`An identity for the user ${email} already exists in the wallet`);
        }

        
        const adminIdentity = await wallet.get('admin');
        if (!adminIdentity) {
            throw Error('An identity for the admin user "admin" does not exist in the wallet');

        }

        
        const provider = wallet.getProviderRegistry().getProvider(adminIdentity.type);
        const adminUser = await provider.getUserContext(adminIdentity, 'admin');

        
        const secret = await ca.register({
            affiliation: 'org1.department1',
            enrollmentID: email,
            role: 'client',
            attrs: [
                { name: 'email', value: email, ecert: true }
            ]
        }, adminUser);

        const enrollment = await ca.enroll({
            enrollmentID: email,
            enrollmentSecret: secret,
            attr_reqs: [
                { name: 'email', optional: false }
            ]
        });

        let userKeys = await walletUtils.createNewWalletEntity(enrollment, email);
        logger.info(`Successfully registered and enrolled  user ${email} and imported it into the wallet`);
        return userKeys;

    } catch (error) {
        logger.error(`Failed to register user ${email}": ${error}`);
        throw error;
    }
}

module.exports = { enrollAdmin, registerUser };
