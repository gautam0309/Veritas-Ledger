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

// WHAT: Import essential classes from the Fabric SDK
// Gateway: Manages the connection to the blockchain network
// Wallets: (Unused here directly, handled by encrypted-wallet.js)
const { Gateway, Wallets } = require('fabric-network');
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
    let ccp = JSON.parse(fs.readFileSync(config.fabric.ccpPath, 'utf8'));

    // 2. Access the Custom Encrypted Wallet
    // WHAT: Uses our Category 3 Fix to securely decrypt keys from the disk.
    const { getEncryptedWallet } = require('./encrypted-wallet');
    let wallet = await getEncryptedWallet(config.fabric.walletPath);

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
    
    // Connect to the gateway using the CCP and the wallet identity
    // asLocalhost: true is crucial for local development using Docker
    await gateway.connect(ccp, { wallet, identity: userEmail, discovery: { enabled: true, asLocalhost: true } });

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
        // Category 2 Fix: Handle MVCC_READ_CONFLICT (Error 10/14) and retry
        // CONCEPT — MVCC (Multi-Version Concurrency Control):
        //   If two transactions try to modify the EXACT SAME piece of data at the EXACT SAME TIME,
        //   Fabric protects data integrity by blocking the second one with an MVCC conflict.
        // HOW WE FIX IT: We wait a few milliseconds (exponential backoff) and automatically try again.
        const isMvccConflict = error.message && (error.message.includes('MVCC_READ_CONFLICT') || error.message.includes('Phantom read conflict'));

        if (isMvccConflict && retryCount < MAX_RETRIES) {
            logger.warn(`MVCC read conflict detected for ${func}. Retrying in ${Math.pow(2, retryCount) * 100}ms... (Attempt ${retryCount + 1})`);
            
            // Wait: 100ms, then 200ms, then 400ms...
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 100));
            
            // Recursive call to try again
            return invokeChaincode(func, args, isQuery, userEmail, retryCount + 1);
        }

        // Category 4 Fix: Circuit Breaker for Offline Fabric
        // WHAT: Detect if the error is a connection failure (e.g., Docker down, incorrect Ngrok URL)
        const isConnectionError = error.message && (
            error.message.includes('Connect Failed') || 
            error.message.includes('No peers found') ||
            error.message.includes('failed to connect') ||
            error.message.includes('DiscoveryService') ||
            error.message.includes('ECONNREFUSED')
        );

        if (isConnectionError) {
            logger.error(`FABRIC OFFLINE: Blockchain network unreachable. Returning offline status.`);
            return { fabricOffline: true, error: error.message };
        }

        logger.error(`Failed to submit transaction: ${error.message || error}`);
        throw error;
    }
}


module.exports = { invokeChaincode };
