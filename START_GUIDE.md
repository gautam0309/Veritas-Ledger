# Veritas-Ledger: Start Guide

This guide provides the exact commands for managing the Veritas-Ledger ecosystem, performing health checks, and self-repairing common issues.

---

## 1. Quick Start (Resume Work)
Use these commands if the system was previously running but stopped.

### A. Start All Containers
```bash
# Start Fabric Network & Databases
docker start mongodb couchdb0 couchdb1 peer0.org1.example.com peer0.org2.example.com orderer.example.com ca_org1 ca_org2 ca_orderer
```

### B. Start the Web Application
```bash
cd web-app
# Surgical start: clears port 4000 then starts dev server
lsof -t -i:4000 | xargs -r kill -9 && npm run dev
```

> [!TIP]
> If you want to clear **every** hanging Node process on your machine, use: `pkill -9 node`. Use with caution!

---

## 2. Health Check (Is it actually running?)
If [localhost:4000](http://localhost:4000) is not loading, run these checks:

### A. Check Docker Containers
```bash
docker ps --format "table {{.Names}}\t{{.Status}}"
```
*Expected: All containers (mongodb, couchdb0, couchdb1, etc.) should be "Up".*

### B. Check Web Server Port
```bash
lsof -i :4000
```
*Expected: One `node` process should be listening on *:4000.*

---

## 3. Self-Repair & Troubleshooting

### A. "Connection Refused" (Infrastructure is Down)
If `docker start mongodb` fails or containers are missing:
```bash
# Force start MongoDB if it's missing entirely
docker run -d --name mongodb -p 27017:27017 mongo

# Restart the Fabric Network
cd fabric-samples/test-network
./network.sh down
./network.sh up createChannel -c mychannel -ca -s couchdb
./network.sh deployCC -ccn educert -ccp ../../chaincode -ccl javascript
```

### B. "Port 4000 In Use" (Zombie Process)
If the app crashes saying the port is in use, kill the ghost process:
```bash
# Force kill any process on port 4000
lsof -t -i:4000 | xargs -r kill -9
```

### C. "DiscoveryService: access denied" (Wallet Sync)
If you can't query the ledger, your local wallet is stale:
```bash
cd web-app
rm -rf wallet
# Restart the app - it will auto-regenerate the admin identity
npm run dev
```

### D. Check Application Logs
If the server starts but you see errors in the browser:
```bash
# View the last 100 lines of the app log
tail -n 100 web-app/app.log
```

---

# 4. Full System Reset (Atomic Wipe)
Use this ONLY if the network is corrupted or you want a 100% clean slate (e.g., bypassing "Identity already registered" errors).

```bash
# 1. Tear down everything
cd fabric-samples/test-network
./network.sh down

# 2. Rebuild network and channel (This wipes the CA database)
./network.sh up createChannel -ca -s couchdb

# 3. Deploy smart contract
./network.sh deployCC -ccn educert -ccp ../../chaincode -ccl javascript

# 4. Wipe local data
cd ../../web-app
rm -rf wallet
# Optional: Clear MongoDB for a truly fresh start
docker exec mongodb mongosh blockchaincertificate --eval "db.universities.drop(); db.students.drop(); db.certificates.drop(); db.auditlogs.drop();"

# 5. Start app
npm run dev
```

---

## 5. Security & Persistence (Self-Healing)
The system now includes a **Self-Healing Identity** mechanism. If a user exists in the database but their wallet file is missing (e.g., after a surgical network restart without wiping the CA), the application will automatically attempt to re-enroll them upon login or dashboard access.

> [!NOTE]
> If the CA itself was NOT reset but the wallet was, and "Identity removal is disabled" on the CA, self-healing will log a warning. In such cases, use a full system reset as described in Section 4.
