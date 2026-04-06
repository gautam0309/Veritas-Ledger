'use strict';

/**
 * gRPC CONNECTION DIAGNOSTIC TOOL
 * 
 * This script tests the exact connection logic used by the web-app 
 * to reach the remote Hyperledger Fabric network on your Contabo VPS.
 */

const path = require('path');
const fs = require('fs');

// Load .env to get MONGODB_URI and other configs
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { invokeChaincode } = require('./web-app/services/fabric/chaincode');
const logger = require('./web-app/services/logger');

async function testConnection() {
    console.log('--- STARTING BLOCKCHAIN CONNECTION DIAGNOSTIC ---');
    console.log('Target VPS IP: 212.47.77.116');
    
    // We'll test with the admin identity or a known student identity
    // If the sync worked, these should be in Atlas
    const testUser = 'admin'; 
    const channel = process.env.FABRIC_CHANNEL_NAME || 'mychannel';
    const chaincodeId = process.env.FABRIC_CHAINCODE_NAME || 'educert';

    console.log(`Testing query 'queryAllCertificates' on channel '${channel}' as user '${testUser}'...`);

    try {
        const result = await invokeChaincode('queryAllCertificates', [], true, testUser);
        
        if (result && result.fabricOffline) {
            console.error('❌ DIAGNOSTIC FAILED: Fabric reported as OFFLINE.');
            console.error(`Error Logic Message: ${result.error || 'Unknown connection error'}`);
            process.exit(1);
        }

        console.log('✅ DIAGNOSTIC SUCCESS: Successfully reached the blockchain!');
        console.log(`Found ${result ? result.length : 0} certificates in the ledger.`);
        process.exit(0);
    } catch (error) {
        console.error('❌ DIAGNOSTIC FAILED with Exception:');
        console.error(error);
        process.exit(1);
    }
}

testConnection();
