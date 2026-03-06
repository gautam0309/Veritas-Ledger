# Veritas-Ledger: Start Guide

This guide provides the exact commands for managing the Veritas-Ledger ecosystem, whether you are starting it back up or performing a full system reset.

---

## 1. Quick Start (Turn On)
Use these commands if the system was previously running but has been stopped (i.e., Docker containers exist but are not running).

### A. Start All Containers
```bash
# Start Fabric Network & Databases
docker start mongodb couchdb0 couchdb1 peer0.org1.example.com peer0.org2.example.com orderer.example.com ca_org1 ca_org2 ca_orderer
```

### B. Start the Web Application
```bash
cd web-app
npm run dev
```

---

## 2. Full System Reset & Redeploy
Use these commands if you want to wipe the ledger, clear the databases, and redeploy the smart contract from scratch.

### A. Tear Down Existing Network
```bash
cd fabric-samples/test-network
./network.sh down
```

### B. Bring Up Fresh Network
```bash
./network.sh up createChannel -c mychannel -ca -s couchdb
```

### C. Deploy Smart Contract
```bash
./network.sh deployCC -ccn educert -ccp ../../chaincode -ccl javascript
```

### D. Clear Application Data (Wallet & DB)
Before starting the app, you MUST clear the old wallet and MongoDB certificates to avoid identity mismatches.

```bash
# From the root directory:
cd web-app
rm -rf wallet
# Use this to clear the MongoDB certificates collection (requires mongosh)
# mongosh blockchaincertificate --eval "db.certificates.drop()"
```

### E. Start Fresh App
```bash
npm run dev
```
*Note: The first run after a reset will automatically enroll a fresh Admin identity.*

---

## Troubleshooting
- **Access Denied**: If you see "DiscoveryService: access denied", it means your `web-app/wallet` is out of sync with the Fabric network. Run `rm -rf web-app/wallet` and restart the app.
- **Port 4000 In Use**: If the app fails to start, kill the existing node process:
  `lsof -i :4000 | grep node | awk '{print $2}' | xargs kill -9`
