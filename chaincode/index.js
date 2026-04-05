/*
 * ============================================================================
 * FILE: chaincode/index.js
 * ============================================================================
 * 
 * PURPOSE:
 *   This is the ENTRY POINT for the Hyperledger Fabric smart contract (chaincode).
 *   When Fabric deploys ("installs") your chaincode, it looks for this file first.
 *   Think of it as the "main.js" or "starting door" for the blockchain code.
 *
 * WHY THIS FILE EXISTS:
 *   Hyperledger Fabric requires a specific structure: the root of your chaincode
 *   package must have an index.js that exports a `contracts` array. Fabric reads
 *   this array to know which smart contract classes are available.
 *
 * HOW IT CONNECTS TO OTHER FILES:
 *   - It imports EducertContract from ./lib/educert_contract.js (the main contract)
 *   - EducertContract in turn uses Certificate, Schema, UniversityProfile models
 *   - The web-app NEVER imports this file directly — Fabric loads it internally
 *     inside DockeI containers (peer nodes)
 *
 * WHEN THIS FILE GETS EXECUTED:
 *   - During `./network.sh deployCC` — Fabric packages, installs, and instantiates
 *     the chaincode. At that point, Fabric reads this index.js to discover contracts.
 *   - Every time a transaction is submitted (e.g., issueCertificate), Fabric loads
 *     the contract class from the `contracts` array exported here.
 *
 * EXECUTION FLOW:
 *   1. Fabric peer receives a transaction proposal
 *   2. Peer loads this index.js
 *   3. Peer finds the `contracts` array → discovers EducertContract
 *   4. Peer calls the appropriate method on EducertContract (e.g., issueCertificate)
 *   5. Result is sent back to the client (web-app)
 * ============================================================================
 */

// 'use strict' enables JavaScript's "strict mode".
// WHAT IT DOES: Forces cleaner code — prevents undeclared variables, disallows
//   duplicate parameter names, and makes silent errors throw actual errors.
// WHY USED: Best practice in Node.js modules. Without it, typos like
//   `userNmae = "John"` (misspelled) would silently create a global variable
//   instead of throwing an error.
// IF REMOVED: Code would still work, but you'd lose protection against
//   subtle bugs caused by typos or unsafe patterns.
'use strict';

// `require()` is Node.js's way of importing code from another file (a "module").
// WHAT THIS LINE DOES: Imports the EducertContract class from ./lib/educert_contract.js.
//   The variable `FabCar` holds a reference to that class.
// WHY NAMED FabCar: This project was originally based on Hyperledger's "FabCar" sample.
//   The name was kept for compatibility even though the contract is now "EducertContract".
// CONCEPT — require() vs import:
//   Node.js uses `require()` (CommonJS module system). Modern JavaScript uses `import`.
//   In this project, `require()` is used because the Fabric chaincode environment
//   expects CommonJS modules, not ES Modules.
// IF REMOVED: Fatal error — Fabric wouldn't know which contract class to use.
const FabCar = require('./lib/educert_contract');

//NOTE: Estore was changed to Educert.
//Todo: During chaincode invocation, each chaincode is given a name. Find out where that name originates from. 

// `module.exports` is how Node.js makes things available to other files.
// WHAT THIS LINE DOES: Exports the FabCar class so other modules can import it.
// WHY NEEDED: Fabric's internal loader reads module.exports to find contract classes.
// CONCEPT — module.exports:
//   Every Node.js file is a "module". When you do `require('./someFile')`, you get
//   back whatever `someFile` put on its `module.exports`. Think of it as the
//   "public interface" of a file — what it wants others to see.
// IF REMOVED: Other files that `require()` this file would get an empty object.
module.exports.FabCar = FabCar;

// `module.exports.contracts` is the CRITICAL export that Hyperledger Fabric looks for.
// WHAT THIS LINE DOES: Tells Fabric "here are all the smart contract classes in this package".
// WHY IT'S AN ARRAY: A chaincode package CAN contain multiple contract classes.
//   Each class has its own set of transaction functions. Here we only have one (FabCar/EducertContract).
// FABRIC INTERNALS: During chaincode instantiation, Fabric iterates over this array,
//   creates instances of each class, and registers their methods as callable transactions.
// IF REMOVED: Fabric would throw an error during deployment saying
//   "No contracts found in chaincode package" — deployment would fail completely.
module.exports.contracts = [FabCar];
