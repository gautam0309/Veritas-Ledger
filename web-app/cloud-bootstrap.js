'use strict';

/**
 * Cloud Bootstrap Script v2 (Migration Mode)
 * 
 * RUN ON VPS: This script scans the local 'wallet' directory and pushes 
 * EVERY user identity (Public/Private Keys) into MongoDB Atlas.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const mongoose = require('mongoose');
const { getMongoWallet } = require('./services/fabric/mongo-wallet');
const fs = require('fs');

async function main() {
    try {
        console.log('--- CLOUD BOOTSTRAP: Full Identity Sync to MongoDB Atlas ---');

        // 1. Connect to MongoDB
        const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
        if (!mongoUri) throw new Error('MONGO_URI not found in .env');

        // Mongoose 5.x settings compatibility
        await mongoose.connect(mongoUri, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            useCreateIndex: true,
            useFindAndModify: false
        });
        console.log('Connected to MongoDB Atlas.');

        // 2. Get Local Wallet Path
        const walletPath = path.resolve(__dirname, 'wallet');
        if (!fs.existsSync(walletPath)) {
            console.error(`Local wallet folder not found at: ${walletPath}`);
            process.exit(1);
        }

        // 3. Initialize Cloud Wallet
        const wallet = await getMongoWallet();

        // 4. Scan and Sync
        const files = fs.readdirSync(walletPath);
        console.log(`Found ${files.length} items in local wallet. Filtering for IDs...`);

        let count = 0;
        for (const file of files) {
            if (file.endsWith('.id')) {
                const label = file.replace('.id', '');
                const identityData = JSON.parse(fs.readFileSync(path.join(walletPath, file), 'utf8'));
                
                // Add to MongoDB Atlas
                // This uses the MongoWallet.put() which includes AES-256 encryption
                await wallet.put(label, identityData);
                count++;
                if (count % 10 === 0) console.log(`Synced ${count} identities...`);
            }
        }

        console.log(`--- SUCCESS: Synced ${count} identities to MongoDB Atlas! ---`);
        console.log(`Student '2301201182@krmu.edu.in' and others are now cloud-ready.`);
        process.exit(0);
    } catch (error) {
        console.error(`Bootstrap Failed: ${error.message}`);
        process.exit(1);
    }
}

main();
