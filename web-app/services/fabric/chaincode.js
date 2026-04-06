//Import Hyperledger Fabric 1.4 programming model - fabric-network
'use strict';

/*
 * ============================================================================
 * FILE: web-app/services/fabric/chaincode.js
 * ============================================================================
 * 
 * PURPOSE:
 *   Provides the core connection bridge between the Node.js web application
 *   and the Hyperledger Fabric blockchain network.
 * 
 * HOW IT CONNECTS:
 *   - Services (like university-service.js) call `invokeChaincode()` instead
 *     of writing complex gateway connection code themselves.
 *   - Uses the official `fabric-network` SDK to connect as a specific user.
 *   - Handles connection setup, transaction routing, and MVCC error retry logic.
 * ============================================================================
 */

// WHAT: The Fabric SDK dependencies are now loaded LAZILY inside functions.
// WHY: In cloud environments (Vercel), these modules can fail during startup.
// const { Gateway, Wallets } = require('fabric-network');
const path = require('path');
const fs = require('fs');

// WHAT: Import configuration (paths to CCP, wallet, channel names)
const config = require("../../loaders/config");

// WHAT: Custom logger
const logger = require("../logger");



const util = require('util');


/**
 * Do all initialization needed to invoke chaincode
 * @param userEmail
 * @returns {Promise<{contract: Contract, gateway: Gateway, network: Network} | Error>} Network objects needed to interact with chaincode
 */

/*
 * ===== FUNCTION: connectToNetwork =====
 * WHAT: Establishes a live connection to the Fabric network as a specific user.
 * WHY: Before you can read or write to the blockchain, you must prove who you are
 *   (using your identity from the wallet) and which channel/contract you want to access.
 */
async function connectToNetwork(userEmail) {

    // 1. Load the Common Connection Profile (CCP)
    // WHAT: CCP is a JSON file that tells the SDK exactly where to find the network
    //   peers, orderers, and certificate authorities (IP addresses and ports).
    let ccp;
    try {
        if (!fs.existsSync(config.fabric.ccpPath)) {
            logger.warn(`CCP file not found at ${config.fabric.ccpPath}. Hyperledger Fabric operations will be disabled.`);
            return { fabricOffline: true };
        }
        ccp = JSON.parse(fs.readFileSync(config.fabric.ccpPath, 'utf8'));

        // Category 4 Fix: Dynamic CCP Hardening (Long Link)
        // WHY: The SDK defaults to a 3-second connection timeout, which is too aggressive for Vercel -> VPS.
        //   We dynamically inject 'request-timeout' and keep-alives into the CCP.
        const peers = ccp.peers || {};
        for (const peerName in peers) {
            if (!peers[peerName].grpcOptions) peers[peerName].grpcOptions = {};
            peers[peerName].grpcOptions['request-timeout'] = 45000; // 45 seconds
            peers[peerName].grpcOptions['grpc.keepalive_time_ms'] = 120000;
            peers[peerName].grpcOptions['grpc.keepalive_timeout_ms'] = 20000;
        }
        const orderers = ccp.orderers || {};
        for (const ordererName in orderers) {
            if (!orderers[ordererName].grpcOptions) orderers[ordererName].grpcOptions = {};
            orderers[ordererName].grpcOptions['request-timeout'] = 45000;
            orderers[ordererName].grpcOptions['grpc.keepalive_time_ms'] = 120000;
        }
    } catch (err) {
        logger.error(`Error reading CCP file: ${err.message}`);
        return { fabricOffline: true };
    }

    // 2. Access the Custom MongoDB Cloud Wallet
    // WHAT: Replaces the file-based wallet for serverless (Vercel) compatibility.
    const { Gateway } = require('fabric-network');
    const { getMongoWallet } = require('./mongo-wallet');
    let wallet = await getMongoWallet();

    // 3. Retrieve User Identity
    // WHAT: Fetches the X.509 certificate and private key for the requested user
    const identity = await wallet.get(userEmail);
    if (!identity) {
        logger.error(`An identity for the user with ${userEmail} does not exist in the wallet`);
        logger.info('Run the registerUser.js application before retrying');
        throw new Error(`An identity for the user with ${userEmail} does not exist in the wallet`);
    }

    // 4. Create and Connect Gateway
    // CONCEPT — Gateway:
    //   The central object of the Fabric SDK. It abstracts away the low-level
    //   gRPC connections and handles transaction endorsement automatically.
    const gateway = new Gateway();
    
    // Connect to the gateway using the CCP and the wallet identity.
    // OPTIMIZATION: asLocalhost: false is required for remote VPS connection.
    // OPTIMIZATION: discovery: { enabled: false } is CRITICAL for Vercel (prevents 5-7s timeout).
    // TUNING: Increasing gRPC deadline and adding keep-alives for Vercel-to-VPS tunnel stability.
    await gateway.connect(ccp, { 
        wallet, 
        identity: userEmail, 
        discovery: { enabled: false, asLocalhost: false },
        queryHandlerOptions: {
            strategy: require('fabric-network').DefaultQueryHandlerStrategies.MSPID_SCOPE_SINGLE,
            timeout: 15000 // Increased from 10s to 15s for cloud-to-VPS latency
        },
        'grpc.keepalive_time_ms': 120000,
        'grpc.keepalive_timeout_ms': 20000,
        'grpc.keepalive_permit_without_calls': 1,
        'grpc-js.default_authority': 'peer0.org1.example.com',
        'grpc.initial_reconnect_backoff_ms': 1000,
        'grpc.max_reconnect_backoff_ms': 5000
    });

    // 5. Connect to the specific Channel and Smart Contract
    const network = await gateway.getNetwork(config.fabric.channelName);
    const contract = network.getContract(config.fabric.chaincodeName);

    // Provide these objects back so invokeChaincode can use them
    return {
        gateway, network, contract
    }

}

/**
 * Invoke any chaincode using fabric sdk
 *
 * @param {String} func - The chaincode function to call
 * @param {[String]} args - Arguments to chaincode function
 * @param {Boolean} isQuery - True if query function, False if transaction function
 * @param {String} userEmail - Email of fabric user that invokes chaincode.
 * @param {Number} retryCount - Current attempt number
 * @returns {Promise<JSON>} Data returned from ledger in Object format
 */

/*
 * ===== FUNCTION: invokeChaincode =====
 * WHAT: The main gateway method used by the entire web app to send requests to Fabric.
 * WHY: Abstracts away SDK complexities. You just pass functionName, args, and "isQuery?".
 * 
 * DISTINCTION: Evaluate vs Submit
 *   - evaluateTransaction (isQuery = true): 
 *       READ-ONLY. Super fast. Sent to a single peer. Never recorded on the ledger.
 *   - submitTransaction (isQuery = false): 
 *       WRITE. Slower. Follows full consensus (Endorse -> Order -> Commit).
 */
async function invokeChaincode(func, args, isQuery, userEmail, retryCount = 0) {
    const MAX_RETRIES = 3;
    try {
        // Build the network connection for the specific user
        let networkObj = await connectToNetwork(userEmail);
        
        // Category 4 Fix: Handle Offline Fabric Circuit Breaker
        // WHY: If connectToNetwork failed to find CCP or connect to Gateway, 
        //   it returns this flag. We must STOP and return it to the caller.
        if (networkObj.fabricOffline) {
            return { fabricOffline: true };
        }

        logger.debug('inside invoke');
        logger.debug(`isQuery: ${isQuery}, func: ${func}, args: ${args}`);

        if (isQuery === true) {
            // === SCENARIO 1: READ-ONLY QUERY === //
            logger.debug('inside isQuery');

            if (args) {
                logger.debug('inside isQuery, args length: ' + args.length);
                // The '...' is the spread operator. It expands the args array into separate arguments
                let response = await networkObj.contract.evaluateTransaction(func, ...args);
                logger.debug(`Transaction ${func} has been evaluated`);

                // Always close the gateway connection to prevent resource leaks
                await networkObj.gateway.disconnect();
                return JSON.parse(response);

            } else {

                // Same thing, but for functions that take absolutely no arguments
                let response = await networkObj.contract.evaluateTransaction(func);
                logger.debug(response);
                logger.debug(`Transaction ${func} without args has been evaluated`);

                await networkObj.gateway.disconnect();

                return JSON.parse(response);
            }
        } else {
            // === SCENARIO 2: STATE-MODIFYING TRANSACTION === //
            logger.debug('notQuery');
            if (args) {
                logger.debug('notQuery, args length: ' + args.length);
                logger.debug(func);

                // submitTransaction hands the request to Fabric to be endorsed, ordered, and written to a block
                let response = await networkObj.contract.submitTransaction(func, ...args);
                logger.debug('after submit');

                logger.debug(`Transaction ${func} has been submitted`);

                await networkObj.gateway.disconnect();

                return JSON.parse(response);


            } else {
                let response = await networkObj.contract.submitTransaction(func);
                logger.debug(response);
                logger.debug(`Transaction ${func} with args has been submitted`);

                await networkObj.gateway.disconnect();

                return JSON.parse(response);
            }
        }

    } catch (error) {
        // Detailed gRPC and Connection Logging for Cloud Diagnosis
        logger.error(`CHAINCODE ERROR [${func}]: ${error.message}`);
        if (error.stack) logger.error(error.stack);

        // Category 2 Fix: Handle MVCC_READ_CONFLICT (Error 10/14) and retry
        const isMvccConflict = error.message && (error.message.includes('MVCC_READ_CONFLICT') || error.message.includes('Phantom read conflict'));

        if (isMvccConflict && retryCount < MAX_RETRIES) {
            logger.warn(`MVCC read conflict detected for ${func}. Retrying in ${Math.pow(2, retryCount) * 100}ms... (Attempt ${retryCount + 1})`);
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 100));
            return invokeChaincode(func, args, isQuery, userEmail, retryCount + 1);
        }

        // Category 4 Fix: Circuit Breaker for Offline Fabric
        const isConnectionError = error.message && (
            error.message.includes('Connect Failed') || 
            error.message.includes('No peers found') ||
            error.message.includes('failed to connect') ||
            error.message.includes('DiscoveryService') ||
            error.message.includes('ECONNREFUSED') ||
            error.message.includes('14 UNAVAILABLE') ||
            error.message.includes('HANDSHAKE_FAILURE')
        );

        if (isConnectionError) {
            logger.error(`FABRIC OFFLINE: Blockchain network unreachable for func ${func}. Error: ${error.message}`);
            return { fabricOffline: true, error: error.message };
        }

        logger.error(`Failed to execute chaincode: ${error.message || error}`);
        throw error;
    }
}


module.exports = { invokeChaincode };
