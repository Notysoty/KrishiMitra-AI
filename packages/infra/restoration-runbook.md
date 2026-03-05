# KrishiMitra-AI Restoration Runbook

> Implements Requirements 39.4, 39.5, 39.7, 39.8

**RTO Target:** 8 hours  
**RPO Target:** 12 hours  
**Last Reviewed:** See git history

---

## Table of Contents

1. [Incident Classification](#1-incident-classification)
2. [Pre-Restoration Checklist](#2-pre-restoration-checklist)
3. [Scenario A — RDS Multi-AZ Automatic Failover](#3-scenario-a--rds-multi-az-automatic-failover)
4. [Scenario B — Restore RDS from Snapshot](#4-scenario-b--restore-rds-from-snapshot)
5. [Scenario C — Cross-Region DR Failover](#5-scenario-c--cross-region-dr-failover)
6. [Scenario D — S3 Object Recovery](#6-scenario-d--s3-object-recovery)
7. [Post-Restoration Validation](#7-post-restoration-validation)
8. [RTO/RPO Tracking](#8-rtorpo-tracking)
9. [Contacts and Escalation](#9-contacts-and-escalation)

---

## 1. Incident Classification

| Severity | Description | RTO | Runbook Section |
|----------|-------------|-----|-----------------|
| P1 | Primary DB AZ failure | ~2 min (automatic) | Section 3 |
| P1 | Full region outage | ≤ 8 hours | Section 5 |
| P2 | Data corruption / accidental deletion | ≤ 8 hours | Section 4 |
| P3 | S3 object loss | ≤ 4 hours | Section 6 |

---

## 2. Pre-Restoration Checklist

Before starting any restoration procedure:

- [ ] Confirm the incident scope (single AZ, full region, data corruption, object loss)
- [ ] Notify the on-call team via PagerDuty / Slack `#incidents`
- [ ] Open an incident ticket and record the start time (for RTO tracking)
- [ ] Identify the target restore point — latest clean snapshot before the incident
- [ ] Confirm AWS credentials / IAM role access for the DR region if needed
- [ ] Put the application in maintenance mode to prevent new writes during restoration:
  ```bash
  # Update ECS service desired count to 0 (stops new traffic)
  aws ecs update-service \
    --cluster krishimitra-prod \
    --service krishimitra-backend \
    --desired-count 0 \
    --region ap-south-1
  ```

---

## 3. Scenario A — RDS Multi-AZ Automatic Failover

**Trigger:** Primary RDS instance becomes unavailable (AZ failure, hardware fault).  
**Expected recovery time:** 60–120 seconds (automatic, no manual steps required).

### What happens automatically

1. RDS detects the primary instance is unhealthy.
2. RDS promotes the standby replica in the secondary AZ to primary.
3. The RDS DNS endpoint (`krishimitra-prod.cluster-xxxx.ap-south-1.rds.amazonaws.com`)
   is updated to point to the new primary.
4. The application reconnects automatically via the connection pool retry logic
   (`packages/backend/src/db/pool.ts` — `connectWithRetry`, max 3 attempts with
   exponential backoff).

### Operator steps

1. **Monitor** the RDS Events console for `Multi-AZ instance failover completed`.
2. **Verify** application health endpoint recovers:
   ```bash
   curl https://api.krishimitra.example.com/api/v1/health
   # Expected: { "status": "ok" }
   ```
3. **Run data consistency check** via the BackupService:
   ```typescript
   const svc = new BackupService();
   const result = await svc.validateDataConsistency();
   console.log(result); // healthy: true expected
   ```
4. **Restore ECS service** to normal desired count:
   ```bash
   aws ecs update-service \
     --cluster krishimitra-prod \
     --service krishimitra-backend \
     --desired-count 2 \
     --region ap-south-1
   ```
5. Record the failover duration in the incident ticket.

---

## 4. Scenario B — Restore RDS from Snapshot

**Trigger:** Data corruption, accidental bulk deletion, or failed migration.  
**Target RTO:** ≤ 8 hours.  
**Target RPO:** ≤ 12 hours (last automated snapshot).

### Step 1 — Identify the restore point (≤ 15 min)

```bash
# List available automated snapshots
aws rds describe-db-snapshots \
  --db-instance-identifier krishimitra-prod \
  --snapshot-type automated \
  --query 'DBSnapshots[*].[DBSnapshotIdentifier,SnapshotCreateTime,Status]' \
  --output table \
  --region ap-south-1
```

Choose the most recent snapshot created **before** the incident.

For point-in-time recovery (PITR) to a specific second:

```bash
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier krishimitra-prod \
  --target-db-instance-identifier krishimitra-restored \
  --restore-time "2024-01-15T10:30:00Z" \
  --db-instance-class db.t3.medium \
  --multi-az \
  --region ap-south-1
```

### Step 2 — Restore to a new instance (≤ 3 hours)

```bash
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier krishimitra-restored \
  --db-snapshot-identifier <snapshot-id> \
  --db-instance-class db.t3.medium \
  --multi-az \
  --vpc-security-group-ids <sg-id> \
  --db-subnet-group-name krishimitra-db-subnet-group \
  --region ap-south-1
```

Wait for the instance status to become `available` (typically 20–40 minutes).

### Step 3 — Validate the restored instance (≤ 30 min)

```bash
# Connect to the restored instance
psql -h krishimitra-restored.xxxx.ap-south-1.rds.amazonaws.com \
     -U krishimitra_admin -d krishimitra

-- Spot-check row counts
SELECT COUNT(*) FROM tenants;
SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM farms;
SELECT COUNT(*) FROM conversations;

-- Check for orphaned users
SELECT COUNT(*) FROM users u
LEFT JOIN tenants t ON u.tenant_id = t.id
WHERE t.id IS NULL;
```

Run the application-level consistency check:

```typescript
const svc = new BackupService();
const result = await svc.validateDataConsistency();
// All checks must pass before proceeding
```

### Step 4 — Switch application traffic (≤ 30 min)

Update the `DATABASE_URL` secret in AWS Secrets Manager to point to the restored instance,
then perform a rolling restart of ECS tasks:

```bash
aws secretsmanager update-secret \
  --secret-id krishimitra/prod/db-credentials \
  --secret-string '{"host":"krishimitra-restored.xxxx.ap-south-1.rds.amazonaws.com",...}' \
  --region ap-south-1

aws ecs update-service \
  --cluster krishimitra-prod \
  --service krishimitra-backend \
  --force-new-deployment \
  --region ap-south-1
```

### Step 5 — Rename and clean up (≤ 30 min)

Once traffic is confirmed healthy on the restored instance:

```bash
# Rename original (corrupted) instance
aws rds modify-db-instance \
  --db-instance-identifier krishimitra-prod \
  --new-db-instance-identifier krishimitra-prod-corrupted \
  --apply-immediately \
  --region ap-south-1

# Rename restored instance to production name
aws rds modify-db-instance \
  --db-instance-identifier krishimitra-restored \
  --new-db-instance-identifier krishimitra-prod \
  --apply-immediately \
  --region ap-south-1
```

---

## 5. Scenario C — Cross-Region DR Failover

**Trigger:** Full `ap-south-1` region outage.  
**Target RTO:** ≤ 8 hours.  
**DR Region:** `ap-southeast-1` (Singapore).

### Step 1 — Confirm region outage (≤ 15 min)

Check the [AWS Service Health Dashboard](https://health.aws.amazon.com/health/status).
Confirm `ap-south-1` is unavailable before proceeding.

### Step 2 — Restore RDS in DR region (≤ 3 hours)

```bash
# List cross-region snapshot copies
aws rds describe-db-snapshots \
  --snapshot-type manual \
  --query 'DBSnapshots[?contains(DBSnapshotIdentifier, `krishimitra-dr`)]' \
  --region ap-southeast-1

# Restore from the latest DR snapshot
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier krishimitra-prod-dr \
  --db-snapshot-identifier krishimitra-dr-<date> \
  --db-instance-class db.t3.medium \
  --multi-az \
  --region ap-southeast-1
```

### Step 3 — Deploy ECS services in DR region (≤ 2 hours)

The ECS task definitions and service configurations are stored in IaC (`packages/infra/`).
Apply the DR stack:

```bash
# Using AWS CDK (task 23.3)
cdk deploy KrishiMitraStack --context env=prod --region ap-southeast-1
```

Update Secrets Manager in `ap-southeast-1` with the DR RDS endpoint.

### Step 4 — Update DNS (≤ 30 min)

Update Route 53 to point `api.krishimitra.example.com` to the DR region's ALB:

```bash
aws route53 change-resource-record-sets \
  --hosted-zone-id <zone-id> \
  --change-batch file://dr-dns-change.json
```

### Step 5 — Validate and resume (≤ 30 min)

```bash
curl https://api.krishimitra.example.com/api/v1/health
```

Run `BackupService.validateDataConsistency()` against the DR database.

---

## 6. Scenario D — S3 Object Recovery

**Trigger:** Accidental deletion or corruption of S3 objects.

### Restore a specific object version

```bash
# List versions of an object
aws s3api list-object-versions \
  --bucket krishimitra-knowledge-base-prod \
  --prefix "articles/crop-disease-guide.json"

# Restore a specific version by copying it back as the current version
aws s3api copy-object \
  --bucket krishimitra-knowledge-base-prod \
  --copy-source "krishimitra-knowledge-base-prod/articles/crop-disease-guide.json?versionId=<version-id>" \
  --key "articles/crop-disease-guide.json"
```

### Restore from DR bucket (if primary bucket is unavailable)

```bash
aws s3 sync \
  s3://krishimitra-knowledge-base-prod-dr/articles/ \
  s3://krishimitra-knowledge-base-prod/articles/ \
  --source-region ap-southeast-1 \
  --region ap-south-1
```

---

## 7. Post-Restoration Validation

After **every** restoration scenario, complete the following before resuming normal operations
(Requirement 39.8):

### 7.1 Application-level consistency check

```typescript
import { BackupService } from '../packages/backend/src/services/backup/BackupService';

const svc = new BackupService();
const result = await svc.validateDataConsistency();

if (!result.healthy) {
  console.error('Data consistency check FAILED:', result.checks.filter(c => !c.passed));
  // DO NOT resume operations — escalate to engineering lead
  process.exit(1);
}
console.log('Data consistency check PASSED. Safe to resume operations.');
```

### 7.2 Smoke tests

```bash
# Run the backend test suite against the restored environment
cd packages/backend
DATABASE_URL=<restored-db-url> npm test -- --testPathPattern="health|auth|farms"
```

### 7.3 Manual verification checklist

- [ ] At least one tenant can log in successfully
- [ ] Farm profile data is accessible for a sample tenant
- [ ] AI Assistant returns a response (even if degraded)
- [ ] Audit logs are intact and queryable
- [ ] No orphaned user records exist
- [ ] S3 knowledge base objects are accessible

### 7.4 Record backup verification

```typescript
const backupId = '<id-of-restored-snapshot>';
const integrity = await svc.verifyBackupIntegrity(backupId);
console.log('Integrity result:', integrity);
// integrity.valid must be true
```

---

## 8. RTO/RPO Tracking

Record the following timestamps in every incident ticket:

| Timestamp | Description |
|-----------|-------------|
| `T0` | Incident detected |
| `T1` | Restoration procedure started |
| `T2` | Restored instance available |
| `T3` | Data consistency check passed |
| `T4` | Application traffic resumed |

**Actual RTO** = `T4 - T0` (must be ≤ 8 hours)  
**Actual RPO** = time between last clean backup and `T0` (must be ≤ 12 hours)

If either target is missed, file a post-incident review within 48 hours.

---

## 9. Contacts and Escalation

| Role | Responsibility |
|------|---------------|
| On-call Engineer | First responder; executes this runbook |
| Engineering Lead | Escalation for P1 incidents; approves DR failover |
| Platform Admin | Notifies affected tenants; manages maintenance mode |
| AWS Support | Engage for infrastructure-level issues (Business/Enterprise support plan) |

Incident channel: `#incidents` in Slack  
PagerDuty service: `KrishiMitra-Platform`
