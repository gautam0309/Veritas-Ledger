# Threat Model: Veritas Ledger (STRIDE)

## 1. System Overview
Veritas Ledger is a decentralized academic certificate platform using Hyperledger Fabric and Node.js.

## 2. Threat Analysis (STRIDE)

| Threat Type | Potential Vector | Mitigation Status |
| :--- | :--- | :--- |
| **Spoofing** | Attacker impersonating a University identity. | **Mitigated**: Fabric TLS Certs + ABAC checks. |
| **Tampering** | Modification of certificate data in MongoDB. | **Mitigated**: On-chain verification (source of truth). |
| **Repudiation** | University denying they issued a fraudulent cert. | **Mitigated**: Non-repudiation via Blockchain signatures. |
| **Info Leakage** | Mass-querying student history via API/Ledger. | **Mitigated**: ABAC enforced in Smart Contract v15. |
| **DoS** | Brute-force attacks on login/issuance endpoints. | **Mitigated**: Rate Limiting (rate-limiter-flexible). |
| **Escalation** | Student gaining University issuance rights. | **Mitigated**: Role-based routing + CA attributes. |

## 3. Key Trust Boundaries
1. **Client <-> API Server**: Protected by CSRF, CORS, and HSTS.
2. **API Server <-> Fabric Org**: Protected by OrgMSP MSP and encrypted wallet.
3. **API Server <-> MongoDB**: Protected by Internal Network + MongoSanitize.

## 4. Continuous Review
This threat model is updated after any change to the `services/fabric` or `chaincode/` components.
