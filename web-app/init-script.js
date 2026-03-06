require('dotenv').config();
require('./loaders/config');
require('./loaders/fabric-loader');
const chaincode = require('./services/fabric/chaincode');

async function run() {
    try {
        console.log("Calling initLedger...");
        let result = await chaincode.invokeChaincode("initLedger", [], false, "admin");
        console.log("Result:", result);
    } catch (e) {
        console.error("Error:", e);
    } finally {
        process.exit(0);
    }
}
run();
