# KrishiMitra-AI Backup Configuration

> Implements Requirements 39.1 – 39.8: Disaster Recovery and Business Continuity

---

## 1. Overview

This document describes the backup and disaster recovery configuration for the KrishiMitra-AI
platform. All infrastructure resources are defined in `packages/infra/` (IaC — task 23.3).
The application-level `BackupService` (`packages/backend/src/services/backup/BackupService.ts`)
records backup events and verifies integrity.

**Targets**

| Metric | Target |
|--------|--------|
| RTO (Recovery Time Objective) | 8 hours |
| RPO (Recovery Point Objective) | 12 hours |
| Backup retention | 30 days |

---

## 2. Amazon RDS — Automated Backups and Multi-AZ

### 2.1 Automated Backups (Requirement 39.1)

Amazon RDS automated backups are enabled on the primary PostgreSQL instance:

```
BackupRetentionPeriod: 30          # days (Requirement 39.3)
PreferredBackupWindow: "01:00-02:00"  # UTC — low-traffic window
DeleteAutomatedBackups: false
```

- RDS takes a daily snapshot plus continuous transaction log backups.
- Point-in-time recovery (PITR) is available for any second within the retention window,
  supporting the 12-hour RPO target.
- Automated backup status is recorded in `backup_records` table via `BackupService.recordBackup()`.

### 2.2 Multi-AZ Deployment (Requirement 39.6)

```
MultiAZ: true
Engine: postgres
EngineVersion: "15.x"
DBInstanceClass: db.t3.medium   # MVP; scale to db.r6g.large for production
StorageEncrypted: true
KmsKeyId: <KMS key ARN>
```

- RDS automatically provisions a synchronous standby replica in a second Availability Zone.
- Failover is automatic: DNS endpoint switches to the standby within ~60–120 seconds.
- No application code changes are required — the JDBC/pg connection string uses the RDS
  cluster endpoint, which is updated automatically on failover.
- `BackupService.validateDataConsistency()` is run after every failover event to confirm
  data integrity before traffic is resumed.

### 2.3 Manual Snapshots

Before every major deployment or schema migration, a manual RDS snapshot is created:

```bash
aws rds create-db-snapshot \
  --db-instance-identifier krishimitra-prod \
  --db-snapshot-identifier krishimitra-pre-deploy-$(date +%Y%m%d%H%M)
```

Manual snapshots are retained indefinitely until explicitly deleted.

---

## 3. Amazon S3 — Versioning and Cross-Region Replication

### 3.1 S3 Buckets

| Bucket | Purpose |
|--------|---------|
| `krishimitra-knowledge-base-{env}` | RAG knowledge articles and embeddings |
| `krishimitra-uploads-{env}` | User-uploaded images (disease detection) |
| `krishimitra-backups-{env}` | RDS snapshot exports, ETL outputs |

### 3.2 Versioning (Requirement 39.2)

Versioning is enabled on all three buckets:

```json
{
  "VersioningConfiguration": {
    "Status": "Enabled"
  }
}
```

- Every `PUT` / `DELETE` creates a new version; previous versions are retained.
- Lifecycle rules transition non-current versions to S3 Glacier after 30 days and
  expire them after 90 days to control storage costs.

### 3.3 Cross-Region Replication (Requirement 39.2, 39.4)

Replication is configured from the primary region (`ap-south-1`) to the DR region (`ap-southeast-1`):

```json
{
  "ReplicationConfiguration": {
    "Role": "arn:aws:iam::<account>:role/krishimitra-s3-replication-role",
    "Rules": [
      {
        "ID": "replicate-all",
        "Status": "Enabled",
        "Filter": {},
        "Destination": {
          "Bucket": "arn:aws:s3:::krishimitra-knowledge-base-{env}-dr",
          "StorageClass": "STANDARD_IA",
          "ReplicationTime": {
            "Status": "Enabled",
            "Time": { "Minutes": 15 }
          }
        },
        "DeleteMarkerReplication": { "Status": "Enabled" }
      }
    ]
  }
}
```

- S3 Replication Time Control (RTC) guarantees 99.99% of objects are replicated within 15 minutes.
- This supports the 12-hour RPO target with significant margin.

### 3.4 Lifecycle Policy

```json
{
  "Rules": [
    {
      "ID": "transition-old-versions",
      "Status": "Enabled",
      "NoncurrentVersionTransitions": [
        { "NoncurrentDays": 30, "StorageClass": "GLACIER" }
      ],
      "NoncurrentVersionExpiration": { "NoncurrentDays": 90 }
    }
  ]
}
```

---

## 4. RDS Snapshot Cross-Region Copy (Requirement 39.2)

RDS automated snapshots are copied to the DR region daily via an AWS Lambda function
(or EventBridge + Lambda) triggered after the backup window:

```bash
aws rds copy-db-snapshot \
  --source-db-snapshot-identifier arn:aws:rds:ap-south-1:<account>:snapshot:<id> \
  --target-db-snapshot-identifier krishimitra-dr-$(date +%Y%m%d) \
  --source-region ap-south-1 \
  --region ap-southeast-1 \
  --copy-tags \
  --kms-key-id <DR-region KMS key ARN>
```

- Cross-region copies are retained for 30 days in the DR region.
- The Lambda function calls `BackupService.recordBackup()` and
  `BackupService.updateBackupStatus()` to track each copy in the `backup_records` table.

---

## 5. Backup Integrity Verification (Requirement 39.2)

After each automated backup cycle, `BackupService.verifyBackupIntegrity(backupId)` is invoked:

**Checks performed:**
1. `record_exists` — backup record has required fields (id, type, source)
2. `status_not_failed` — backup did not error during creation
3. `within_retention_window` — backup age ≤ 30 days
4. `region_specified` — geographic location is recorded
5. `metadata_present` — snapshot/object metadata is attached

Results are written to the `backup_records` table and logged to the audit trail.
Alerts are sent via CloudWatch Alarms if any check fails.

---

## 6. ECS Service Auto-Recovery (Requirement 39.6)

Amazon ECS is configured with the following resilience settings:

```json
{
  "deploymentConfiguration": {
    "minimumHealthyPercent": 50,
    "maximumPercent": 200
  },
  "healthCheckGracePeriodSeconds": 60
}
```

- ECS replaces unhealthy tasks automatically within the same cluster.
- The Application Load Balancer health check (`GET /api/v1/health`) removes unhealthy
  targets from rotation within 30 seconds.
- For full AZ failure, ECS tasks are redistributed across remaining AZs automatically.

---

## 7. Backup Retention Summary (Requirement 39.3)

| Resource | Retention | Location |
|----------|-----------|----------|
| RDS automated snapshots | 30 days | ap-south-1 |
| RDS cross-region copies | 30 days | ap-southeast-1 |
| S3 current versions | Indefinite | ap-south-1 + ap-southeast-1 |
| S3 non-current versions | 90 days | ap-south-1 + ap-southeast-1 |
| Manual RDS snapshots | Indefinite | ap-south-1 |
| `backup_records` DB table | 30 days (application) | RDS primary |

---

## 8. Monitoring and Alerting

CloudWatch alarms are configured for:

- `RDS FreeStorageSpace < 10 GB` → SNS alert to ops team
- `RDS ReplicaLag > 60 seconds` → SNS alert
- `S3 ReplicationLatency > 900 seconds` → SNS alert
- Backup Lambda function errors → SNS alert
- `BackupService` integrity check failures → CloudWatch log metric filter + alarm
