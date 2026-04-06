'use strict';

/**
 * Cloud Bootstrap Script
 * 
 * RUN ON VPS: This script initializes the "Admin" identity into MongoDB Atlas.
 * Once the admin is in the cloud database, the Vercel-hosted frontend will be 
 * able to use that admin identity to register new users and universities.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../web-app/.env') });

const mongoose = require('mongoose');
const FabricCAServices = require('fabric-ca-client');
const { getMongoWallet } = require('../web-app/services/fabric/mongo-wallet');
const fs = require('fs');

async function main() {
    try {
        console.log('--- CLOUD BOOTSTRAP: Syncing Fabric Admin to MongoDB Atlas ---');

        // 1. Connect to MongoDB
        const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
        if (!mongoUri) throw new Error('MONGO_URI not found in .env');

        await mongoose.connect(mongoUri, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            useCreateIndex: true,
            useFindAndModify: false
        });
        console.log('Connected to MongoDB Atlas.');

        // 2. Load Connection Profile
        const ccpPath = path.resolve(__dirname, '..', 'fabric-samples', 'test-network', 'organizations', 'peerOrganizations', 'org1.example.com', 'connection-org1.json');
        if (!fs.existsSync(ccpPath)) throw new Error(`CCP not found at ${ccpPath}`);
        const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));

        // 3. Create CA Client
        const caInfo = ccp.certificateAuthorities['ca.org1.example.com'];
        const caTLSCACerts = caInfo.tlsCACerts.pem;
        // On VPS, we use 'localhost' URL because the CA is local to the script
        const caUrl = caInfo.url.replace('212.47.77.116', 'localhost');
        const ca = new FabricCAServices(caUrl, { trustedRoots: caTLSCACerts, verify: false }, caInfo.caName);

        // 4. Enroll Admin
        console.log(`Enrolling admin on CA: ${caUrl}...`);
        const enrollment = await ca.enroll({ enrollmentID: 'admin', enrollmentSecret: 'adminpw' });
        
        const x509Identity = {
            credentials: {
                certificate: enrollment.certificate,
                privateKey: enrollment.key.toBytes(),
            },
            mspId: 'Org1MSP',
            type: 'X.509',
        };

        // 5. Save to MongoDB Wallet
        const wallet = await getMongoWallet();
        await wallet.put('admin', x509Identity);

        console.log('Successfully synced "admin" identity to MongoDB Atlas!');
        console.log('The Vercel frontend is now authorized to issue certificates via the VPS.');
        
        process.exit(0);
    } catch (error) {
        console.error(`Bootstrap Failed: ${error.message}`);
        process.exit(1);
    }
}

main();
