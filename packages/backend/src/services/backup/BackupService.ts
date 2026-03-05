import { v4 as uuidv4 } from 'uuid';
import { getPool } from '../../db/pool';
import { AuditService } from '../admin/AuditService';

// ── Types ──────────────────────────────────────────────────────

export type BackupStatus = 'pending' | 'completed' | 'failed' | 'verified';

export interface BackupRecord {
  id: string;
  type: 'rds_snapshot' | 's3_object' | 'manual';
  status: BackupStatus;
  region: string;
  source: string;
  size_bytes?: number;
  created_at: Date;
  verified_at?: Date;
  error?: string;
  metadata: Record<string, unknown>;
}

export interface BackupIntegrityResult {
  backup_id: string;
  valid: boolean;
  checks_passed: string[];
  checks_failed: string[];
  verified_at: Date;
}

export interface DataConsistencyResult {
  healthy: boolean;
  checks: Array<{ name: string; passed: boolean; detail?: string }>;
  checked_at: Date;
}

export class BackupError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'BackupError';
  }
}

// ── Constants ──────────────────────────────────────────────────

/** Backup retention period in days (Requirement 39.3). */
export const BACKUP_RETENTION_DAYS = 30;

/** RTO target in hours (Requirement 39.4). */
export const RTO_HOURS = 8;

/** RPO target in hours (Requirement 39.5). */
export const RPO_HOURS = 12;

// ── Service ────────────────────────────────────────────────────

export class BackupService {
  private readonly audit: AuditService;

  constructor(audit?: AuditService) {
    this.audit = audit ?? new AuditService();
  }

  /**
   * Verify the integrity of a backup by checking its metadata and status.
   * Requirement 39.2: verify integrity and store in geographically distributed locations.
   */
  async verifyBackupIntegrity(backupId: string): Promise<BackupIntegrityResult> {
    const pool = getPool();

    const result = await pool.query(
      `SELECT * FROM backup_records WHERE id = $1`,
      [backupId],
    );

    if (result.rows.length === 0) {
      throw new BackupError(`Backup not found: ${backupId}`, 'BACKUP_NOT_FOUND');
    }

    const backup = this.mapRow(result.rows[0] as Record<string, unknown>);
    const checksPassed: string[] = [];
    const checksFailed: string[] = [];

    // Check 1: backup record exists and has required fields
    if (backup.id && backup.type && backup.source) {
      checksPassed.push('record_exists');
    } else {
      checksFailed.push('record_exists');
    }

    // Check 2: backup is not in failed state
    if (backup.status !== 'failed') {
      checksPassed.push('status_not_failed');
    } else {
      checksFailed.push('status_not_failed');
    }

    // Check 3: backup is within retention window
    const ageMs = Date.now() - new Date(backup.created_at).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    if (ageDays <= BACKUP_RETENTION_DAYS) {
      checksPassed.push('within_retention_window');
    } else {
      checksFailed.push('within_retention_window');
    }

    // Check 4: backup has a known region (geographic distribution)
    if (backup.region && backup.region.length > 0) {
      checksPassed.push('region_specified');
    } else {
      checksFailed.push('region_specified');
    }

    // Check 5: metadata is present
    if (backup.metadata && typeof backup.metadata === 'object') {
      checksPassed.push('metadata_present');
    } else {
      checksFailed.push('metadata_present');
    }

    const valid = checksFailed.length === 0;
    const verifiedAt = new Date();

    // Update verified_at timestamp if valid
    if (valid) {
      await pool.query(
        `UPDATE backup_records SET status = 'verified', verified_at = $1 WHERE id = $2`,
        [verifiedAt, backupId],
      );
    }

    // Log to audit trail
    await this.audit.log({
      user_id: 'system',
      action: 'backup_integrity_verified',
      resource_type: 'backup',
      resource_id: backupId,
      changes: { valid, checks_passed: checksPassed, checks_failed: checksFailed },
    });

    return {
      backup_id: backupId,
      valid,
      checks_passed: checksPassed,
      checks_failed: checksFailed,
      verified_at: verifiedAt,
    };
  }

  /**
   * List backups created within the last N days.
   * Requirement 39.3: maintain 30-day backup retention.
   */
  async listRecentBackups(days: number): Promise<BackupRecord[]> {
    if (days < 1 || days > BACKUP_RETENTION_DAYS) {
      throw new BackupError(
        `days must be between 1 and ${BACKUP_RETENTION_DAYS}`,
        'INVALID_DAYS',
      );
    }

    const pool = getPool();
    const result = await pool.query(
      `SELECT * FROM backup_records
       WHERE created_at >= NOW() - INTERVAL '${days} days'
       ORDER BY created_at DESC`,
    );

    return (result.rows as Record<string, unknown>[]).map((r) => this.mapRow(r));
  }

  /**
   * Run basic DB health checks to validate data consistency.
   * Requirement 39.8: validate data consistency before resuming operations.
   */
  async validateDataConsistency(): Promise<DataConsistencyResult> {
    const pool = getPool();
    const checks: DataConsistencyResult['checks'] = [];

    // Check 1: DB connection is alive
    try {
      await pool.query('SELECT 1');
      checks.push({ name: 'db_connection', passed: true });
    } catch (err) {
      checks.push({
        name: 'db_connection',
        passed: false,
        detail: err instanceof Error ? err.message : String(err),
      });
    }

    // Check 2: Core tables are accessible
    const coreTables = ['tenants', 'users', 'farms', 'conversations'];
    for (const table of coreTables) {
      try {
        await pool.query(`SELECT COUNT(*) FROM ${table}`);
        checks.push({ name: `table_accessible_${table}`, passed: true });
      } catch (err) {
        checks.push({
          name: `table_accessible_${table}`,
          passed: false,
          detail: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Check 3: No orphaned user records (users without a valid tenant)
    try {
      const orphanResult = await pool.query(
        `SELECT COUNT(*) AS cnt FROM users u
         LEFT JOIN tenants t ON u.tenant_id = t.id
         WHERE t.id IS NULL`,
      );
      const orphanCount = parseInt(orphanResult.rows[0].cnt as string, 10);
      checks.push({
        name: 'no_orphaned_users',
        passed: orphanCount === 0,
        detail: orphanCount > 0 ? `${orphanCount} orphaned user(s) found` : undefined,
      });
    } catch (err) {
      checks.push({
        name: 'no_orphaned_users',
        passed: false,
        detail: err instanceof Error ? err.message : String(err),
      });
    }

    const healthy = checks.every((c) => c.passed);
    const checkedAt = new Date();

    // Log consistency check to audit trail
    await this.audit.log({
      user_id: 'system',
      action: 'data_consistency_validated',
      resource_type: 'database',
      resource_id: 'primary',
      changes: { healthy, checks },
    });

    return { healthy, checks, checked_at: checkedAt };
  }

  /**
   * Record a new backup entry (called by automated backup processes or IaC triggers).
   */
  async recordBackup(params: {
    type: BackupRecord['type'];
    region: string;
    source: string;
    size_bytes?: number;
    metadata?: Record<string, unknown>;
  }): Promise<BackupRecord> {
    const pool = getPool();
    const id = uuidv4();

    const result = await pool.query(
      `INSERT INTO backup_records
         (id, type, status, region, source, size_bytes, created_at, metadata)
       VALUES ($1, $2, 'pending', $3, $4, $5, NOW(), $6)
       RETURNING *`,
      [
        id,
        params.type,
        params.region,
        params.source,
        params.size_bytes ?? null,
        JSON.stringify(params.metadata ?? {}),
      ],
    );

    const record = this.mapRow(result.rows[0] as Record<string, unknown>);

    await this.audit.log({
      user_id: 'system',
      action: 'backup_recorded',
      resource_type: 'backup',
      resource_id: id,
      changes: { type: params.type, region: params.region, source: params.source },
    });

    return record;
  }

  /**
   * Mark a backup as completed or failed.
   */
  async updateBackupStatus(
    backupId: string,
    status: 'completed' | 'failed',
    error?: string,
  ): Promise<BackupRecord> {
    const pool = getPool();

    const result = await pool.query(
      `UPDATE backup_records
       SET status = $1, error = $2
       WHERE id = $3
       RETURNING *`,
      [status, error ?? null, backupId],
    );

    if (result.rows.length === 0) {
      throw new BackupError(`Backup not found: ${backupId}`, 'BACKUP_NOT_FOUND');
    }

    await this.audit.log({
      user_id: 'system',
      action: 'backup_status_updated',
      resource_type: 'backup',
      resource_id: backupId,
      changes: { status, error },
    });

    return this.mapRow(result.rows[0] as Record<string, unknown>);
  }

  // ── Private helpers ────────────────────────────────────────

  private mapRow(row: Record<string, unknown>): BackupRecord {
    return {
      id: row.id as string,
      type: row.type as BackupRecord['type'],
      status: row.status as BackupStatus,
      region: row.region as string,
      source: row.source as string,
      size_bytes: row.size_bytes as number | undefined,
      created_at: new Date(row.created_at as string),
      verified_at: row.verified_at ? new Date(row.verified_at as string) : undefined,
      error: row.error as string | undefined,
      metadata:
        typeof row.metadata === 'string'
          ? (JSON.parse(row.metadata) as Record<string, unknown>)
          : (row.metadata as Record<string, unknown>) ?? {},
    };
  }
}
