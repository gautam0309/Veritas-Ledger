'use strict';
require('dotenv').config();

const { Gateway } = require('fabric-network');
const { getEncryptedWallet } = require('./services/fabric/encrypted-wallet');
const fs = require('fs');
const path = require('path');
const config = require('./loaders/config');

async function main() {
    try {
        const ccpPath = config.fabric.ccpPath;
        const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));
        const walletPath = config.fabric.walletPath;
        const wallet = await getEncryptedWallet(walletPath);

        const gateway = new Gateway();
        // Use an identity that exists (e.g. test2adisr14920251@gmail.com which we updated password for)
        // Or create a new one. Let's assume we use the one we just fixed.
        // Wait, we need to know if this identity has issued any certificates.
        const identityLabel = 'test2adisr14920251@gmail.com';

        const identity = await wallet.get(identityLabel);
        if (!identity) {
            console.log(`An identity for the user "${identityLabel}" does not exist in the wallet`);
            console.log('Run the application to register user first');
            return;
        }

        await gateway.connect(ccp, {
            wallet,
            identity: identityLabel,
            discovery: { enabled: true, asLocalhost: true }
        });

        const network = await gateway.getNetwork(config.fabric.channelName);
        const contract = network.getContract(config.fabric.chaincodeName);

        // Try to revoke a non-existent cert first to check connectivity
        console.log('Testing Revocation with Non-Existent Cert...');
        try {
            await contract.submitTransaction('revokeCertificate', 'NON_EXISTENT_UUID', 'Test Revocation');
            console.log('Transaction succeeded (Unexpected)');
        } catch (error) {
            console.log(`Transaction failed as expected: ${error}`);
        }

        gateway.disconnect();

    } catch (error) {
        console.error(`Failed: ${error}`);
        process.exit(1);
    }
}

main();
