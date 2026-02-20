# Incident Response Playbook (SAMM Operations L3)

## 1. Private Key Compromise
- **Detection**: Unauthorized transactions found on the ledger or anomalous login activity in `AuditLog`.
- **Action**: 
    1. Immediately revoke the compromised identity via the Fabric CA.
    2. Update the encrypted wallet entry.
    3. Notify the impacted student or university to rotate their credentials.
    4. Audit the ledger for any unauthorized certificates issued during the compromise window.

## 2. Node.js Application Crash
- **Detection**: Service unavailable or PM2/systemd restart loop.
- **Action**:
    1. Inspect `app.log` for memory leaks or unhandled promise rejections.
    2. Roll back to the previous stable git commit if the crash is due to a recent deployment.
    3. Perform a database integrity check to ensure MongoDB and Ledger are in sync.

## 3. Blockchain Data Desync (Ledger vs Database)
- **Detection**: `check-revocation.js` utility returns mismatches.
- **Action**:
    1. Halt issuance for the impacted university.
    2. Re-sync the database state by re-querying the blockchain ledger history for the missing certificate IDs.
    3. Perform a manual reconciliation of the `AuditLog`.

## 4. Account Takeover (ATO)
- **Detection**: "Multiple login failures" alert from `alert-service.js`.
- **Action**:
    1. Temporarily lock the IP address at the firewall or load balancer.
    2. Trigger a password reset requirement for the targeted account.
    3. Enable MFA for the user if available.
