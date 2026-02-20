# Academic Certificates on the Blockchain

The academic certificate verification platform using blockchain technology is used to issue, manage and verify academic certificates in a secure and distributed manner. This project addresses the need for a secure digital platform to issue and verify academic certificates without intervention from the original certificate issuer (University).

![solution-overview](./resources/solution-overview.png)

The core functionality of this application are :
* Create and issue academic certificates.
* Manage and share academic certificates.
* Verify authenticity of shared certificates.

## Architecture Overview
![architecture-overview](./resources/network-architecture.png)

The following technologies are used on the application
* **[Hyperledger Fabric](https://www.hyperledger.org/use/fabric)**: Used to build the blockchain network, run smart contracts. Fabric CA is used to enroll members in the network. 
* **[Node.js](https://nodejs.org/en/)**: Backend of the web application is built in nodeJS runtime using the express framework. Chaincode is also written in NodeJS.
* **[MongoDB](https://www.mongodb.com/)**: The user and certificate data is stored in MongoDB database. 
* **[Bootstrap](https://getbootstrap.com/)**: The front-end of the web application is built using bootstrap, ejs & jQuery.

## Network Users

The users of the platform include - Universities, Students and Certificate Verifiers (Eg - Employers). The actions that can be performed by each party are as follows

**Universities**
* Issue academic certificates.
* View academic certificates issued. 
* Endorse Verification and digitally sign academic certificates.

**Students**
* Receive academic certificates from universities.
* View and manage received academic certificates.
* Share academic certificates with third party verifiers.
* Selective disclosure of certificate data.

**Verifier**
* Receive certificate data from students.
* Verify certificate authenticity with blockchain platform.

To learn more about how selective disclosure and decentralized verifications work, read about [verifiable credentials](https://en.wikipedia.org/wiki/Verifiable_credentials).


## Getting Started

### Prerequisites

1) **Docker & Docker Compose** (Docker Engine 20+)
2) **Hyperledger Fabric v2.2.0** binaries and Docker images
3) **Node.js** (v12+ for chaincode, v16+ for web app)
4) **MongoDB** (v4.0+ or via Docker)  
5) **npm** package manager
6) **Go** (optional, for Fabric tools compilation)

### Step 1: Clone the Repository

```sh
git clone https://github.com/gautam0309/Veritas-Ledger.git
cd Veritas-Ledger
```

### Step 2: Download Fabric Binaries & Docker Images

```sh
# Download Fabric v2.2.0 binaries and images
curl -sSL https://bit.ly/2ysbOFE | bash -s -- 2.2.0 1.5.5

# Or if bootstrap.sh is available:
# ./bootstrap.sh
```

This downloads `fabric-samples/bin/` (peer, orderer, configtxgen, etc.) and pulls Docker images:
- `hyperledger/fabric-peer:2.2.0`
- `hyperledger/fabric-orderer:2.2.0`
- `hyperledger/fabric-ca:1.5.5`  
- `hyperledger/fabric-tools:2.2.0`
- `hyperledger/fabric-ccenv:2.2.0`
- `couchdb:3.1.1`

### Step 3: Start the Fabric Network

```sh
cd fabric-samples/test-network
./network.sh up createChannel -c mychannel -ca -s couchdb
```

This commands spins up the network nodes (Orderer, Peers), creates `mychannel`, enables the Fabric Certificate Authorities (`-ca`), and importantly, starts the network with CouchDB (`-s couchdb`) which is required for our secure pagination queries.

**Verify all containers are running:**
```sh
docker ps --format "table {{.Names}}\t{{.Status}}"
```

### Step 4: Deploy Chaincode

We use the streamlined `deployCC` script to package, install, approve, and commit the smart contract in one command.

```sh
# Ensure you are still in fabric-samples/test-network
./network.sh deployCC -ccn educert -ccp ../../chaincode -ccl javascript
```

### Step 5: Start MongoDB

The backend API requires MongoDB to store relational user data and session cookies.

```sh
# Option A: If MongoDB is installed locally
mongod --dbpath /data/db

# Option B: Using Docker
docker run -d --name mongodb -p 27017:27017 mongo:4.4
```
Ensure a database named `blockchaincertificate` is available on `localhost:27017`.

### Step 6: Configure and Start Web Application

```sh
cd ../../web-app

# Install dependencies
npm install

# Create .env file
cat > .env << 'EOF'
MONGODB_URI_LOCAL = mongodb://localhost:27017/blockchaincertificate
PORT = 4000
LOG_LEVEL = debug
EXPRESS_SESSION_SECRET = your-long-random-secret-string-here
CCP_PATH = /absolute/path/to/Veritas-Ledger/fabric-samples/test-network/organizations/peerOrganizations/org1.example.com/connection-org1.json
FABRIC_CHANNEL_NAME = mychannel
FABRIC_CHAINCODE_NAME = educert
EOF

# IMPORTANT: Update CCP_PATH to exactly match your machine's absolute path to the connection-org1.json file

# Start the server (Development Mode)
npm run dev
```

The application will be available at `http://localhost:4000`. Upon first boot, the system will automatically communicate with the Fabric CA, enroll the master `admin` identity, and store it securely in the encrypted `wallet/` directory.

### Troubleshooting

| Issue | Fix |
|---|---|
| ExecuteQueryWithMetadata not supported for leveldb | The network was started without CouchDB. Run `./network.sh down` then `./network.sh up createChannel -c mychannel -ca -s couchdb`. |
| University already exists | The MongoDB database and the Fabric CA are out of sync. Drop the `blockchaincertificate` MongoDB database and delete the `wallet/` folder to restart. |
| Identity admin already exists | The CA still retains the previous database. Stop the network and delete `fabric-samples/test-network/organizations/fabric-ca/org1/fabric-ca-server.db`. |

Project Link: [https://github.com/gautam0309/Veritas-Ledger](https://github.com/gautam0309/Veritas-Ledger)
