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
cd fabric-samples/test-network\n./network.sh up createChannel -ca -c mychannel -s couchdb
```

This starts **9 containers**: orderer, 2 peers, 2 CouchDB, 3 CAs, CLI.

**Verify all containers are running:**
```sh
docker ps --format "table {{.Names}}\t{{.Status}}"
```

### Step 4: Install Chaincode Dependencies

```sh
cd ../../chaincode

# IMPORTANT: Use the backup lockfile for Node 12 compatibility inside Docker
cp package-lock-backup.json package-lock.json

# Do NOT run npm install locally - Docker handles deps during chaincode install
```

### Step 5: Deploy Chaincode

```sh
cd ../fabric-samples/test-network

# Set PATH to include Fabric binaries
export PATH=${PWD}/../bin:$PATH
export FABRIC_CFG_PATH=$PWD/../config/

# Package chaincode
peer lifecycle chaincode package fabcar.tar.gz \
  --path ../../chaincode/ \
  --lang node \
  --label fabcar_1

# Install on Org1 peer
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_LOCALMSPID="Org1MSP"
export CORE_PEER_TLS_ROOTCERT_FILE=${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt
export CORE_PEER_MSPCONFIGPATH=${PWD}/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp
export CORE_PEER_ADDRESS=localhost:7051

peer lifecycle chaincode install fabcar.tar.gz

# Save the package ID from the output
# Example: fabcar_1:abc123...

# Install on Org2 peer
export CORE_PEER_LOCALMSPID="Org2MSP"
export CORE_PEER_TLS_ROOTCERT_FILE=${PWD}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt
export CORE_PEER_MSPCONFIGPATH=${PWD}/organizations/peerOrganizations/org2.example.com/users/Admin@org2.example.com/msp
export CORE_PEER_ADDRESS=localhost:9051

peer lifecycle chaincode install fabcar.tar.gz

# Query installed to get Package ID
peer lifecycle chaincode queryinstalled
# Copy the Package ID from output

export CC_PACKAGE_ID=<paste_package_id_here>

# Approve for Org2
peer lifecycle chaincode approveformyorg \
  -o localhost:7050 \
  --ordererTLSHostnameOverride orderer.example.com \
  --channelID mychannel \
  --name fabcar \
  --version 1.0 \
  --package-id $CC_PACKAGE_ID \
  --sequence 1 \
  --tls \
  --cafile "${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem"

# Approve for Org1
export CORE_PEER_LOCALMSPID="Org1MSP"
export CORE_PEER_TLS_ROOTCERT_FILE=${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt
export CORE_PEER_MSPCONFIGPATH=${PWD}/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp
export CORE_PEER_ADDRESS=localhost:7051

peer lifecycle chaincode approveformyorg \
  -o localhost:7050 \
  --ordererTLSHostnameOverride orderer.example.com \
  --channelID mychannel \
  --name fabcar \
  --version 1.0 \
  --package-id $CC_PACKAGE_ID \
  --sequence 1 \
  --tls \
  --cafile "${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem"

# Check commit readiness
peer lifecycle chaincode checkcommitreadiness \
  --channelID mychannel \
  --name fabcar \
  --version 1.0 \
  --sequence 1 \
  --tls \
  --cafile "${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem" \
  --output json

# Commit (both orgs must show true)
peer lifecycle chaincode commit \
  -o localhost:7050 \
  --ordererTLSHostnameOverride orderer.example.com \
  --channelID mychannel \
  --name fabcar \
  --version 1.0 \
  --sequence 1 \
  --tls \
  --cafile "${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem" \
  --peerAddresses localhost:7051 \
  --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt" \
  --peerAddresses localhost:9051 \
  --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt"

# Initialize the ledger
peer chaincode invoke \
  -o localhost:7050 \
  --ordererTLSHostnameOverride orderer.example.com \
  --tls \
  --cafile "${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem" \
  -C mychannel -n fabcar \
  --peerAddresses localhost:7051 \
  --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt" \
  --peerAddresses localhost:9051 \
  --tlsRootCertFiles "${PWD}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt" \
  -c '{"function":"initLedger","Args":[]}'
```

### Step 6: Start MongoDB

```sh
# Option A: If MongoDB is installed locally
mongod --dbpath /data/db

# Option B: Using Docker
docker run -d --name mongodb -p 27017:27017 mongo:4.4
```

### Step 7: Configure and Start Web Application

```sh
cd ../../web-app

# Install dependencies
npm install
npm install --include=dev

# Create .env file
cat > .env << 'EOF'
MONGODB_URI_LOCAL = mongodb://localhost:27017/blockchaincertificate
PORT = 3000
LOG_LEVEL = info
EXPRESS_SESSION_SECRET = your-long-random-secret-string-here
CCP_PATH = /absolute/path/to/fabric-samples/test-network/organizations/peerOrganizations/org1.example.com/connection-org1.json
FABRIC_CHANNEL_NAME = mychannel
FABRIC_CHAINCODE_NAME = fabcar
EOF

# IMPORTANT: Update CCP_PATH to your actual absolute path

# Start the server
npm run start-development
```

The application will be available at `http://localhost:3000`

### Troubleshooting

| Issue | Fix |
|---|---|
| Orderer fails with "Bootstrap method: 'file' is forbidden" | Docker images are wrong version. Ensure `IMAGETAG=2.2.0` in `network.sh` and docker-compose files use `${IMAGE_TAG}` not `:latest` |
| Chaincode fails with `SyntaxError: Unexpected token '='` | Dependencies pulled ES2021+ code. Use `package-lock-backup.json` as `package-lock.json` |
| `npm ci` fails with "Cannot read property" | npm lockfile version mismatch. Copy `package-lock-backup.json` directly, don't run `npm install` locally first |
| TLS certificate errors | Ensure `FABRIC_CA_SERVER_CSR_HOSTS=localhost,127.0.0.1` in CA docker-compose |
| Port 3000 in use | Change `PORT` in `.env` to another port (e.g., 4000) |


Project Link: [https://github.com/gautam0309/Veritas-Ledger](https://github.com/gautam0309/Veritas-Ledger)
