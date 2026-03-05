import { getPool } from '../../db/pool';
import { AuditLog, AuditLogFilter, AuditLogResult, SuspiciousActivityRule } from '../../types/audit';

/** Minimum retention period in years for audit logs. */
export const AUDIT_RETENTION_YEARS = 3;

/** Actions considered sensitive data access. */
const SENSITIVE_ACTIONS = new Set([
  'view_user_data',
  'export_user_data',
  'view_farm_data',
  'export_farm_data',
  'view_financial_data',
  'data_export',
  'bulk_export',
  'view_personal_info',
]);

/** Default suspicious activity rules. */
const SUSPICIOUS_RULES: SuspiciousActivityRule[] = [
  {
    type: 'failed_login',
    threshold: 10,
    window_minutes: 30,
    description: 'Multiple failed login attempts',
  },
  {
    type: 'unusual_data_access',
    threshold: 50,
    window_minutes: 60,
    description: 'Unusual volume of data access',
  },
  {
    type: 'bulk_deletion',
    threshold: 5,
    window_minutes: 10,
    description: 'Multiple deletion operations in short period',
  },
];

export class AuditService {

  /**
   * Record an immutable audit log entry.
   * Automatically flags sensitive data access and checks for suspicious activity.
   */
  async log(params: {
    tenant_id?: string;
    user_id: string;
    action: string;
    resource_type: string;
    resource_id: string;
    changes?: Record<string, unknown>;
    ip_address?: string;
    user_agent?: string;
  }): Promise<AuditLog> {
    const pool = getPool();
    const isSensitive = SENSITIVE_ACTIONS.has(params.action);

    const result = await pool.query(
      `INSERT INTO audit_logs
        (id, tenant_id, user_id, action, resource_type, resource_id, changes, ip_address, user_agent, timestamp, is_sensitive, is_suspicious, suspicious_reason)
       VALUES
        (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9, FALSE, NULL)
       RETURNING *`,
      [
        params.tenant_id ?? null,
        params.user_id,
        params.action,
        params.resource_type,
        params.resource_id,
        params.changes ? JSON.stringify(params.changes) : null,
        params.ip_address ?? null,
        params.user_agent ?? null,
        isSensitive,
      ],
    );

    const entry = this.mapRow(result.rows[0]);

    // Check for suspicious activity asynchronously (don't block the caller)
    this.checkSuspiciousActivity(params.user_id, params.action).catch((err) =>
      console.error('Suspicious activity check failed:', err),
    );

    return entry;
  }

  /**
   * Record a sensitive data access event explicitly.
   */
  async logSensitiveAccess(params: {
    tenant_id?: string;
    user_id: string;
    resource_type: string;
    resource_id: string;
    ip_address?: string;
    user_agent?: string;
  }): Promise<AuditLog> {
    return this.log({
      ...params,
      action: 'view_user_data',
    });
  }

  /**
   * Search and filter audit logs.
   */
  async search(filter: AuditLogFilter): Promise<AuditLogResult> {
    const pool = getPool();
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (filter.tenant_id) {
      conditions.push(`tenant_id = $${idx++}`);
      params.push(filter.tenant_id);
    }
    if (filter.user_id) {
      conditions.push(`user_id = $${idx++}`);
      params.push(filter.user_id);
    }
    if (filter.action) {
      conditions.push(`action = $${idx++}`);
      params.push(filter.action);
    }
    if (filter.resource_type) {
      conditions.push(`resource_type = $${idx++}`);
      params.push(filter.resource_type);
    }
    if (filter.start_date) {
      conditions.push(`timestamp >= $${idx++}`);
      params.push(filter.start_date);
    }
    if (filter.end_date) {
      conditions.push(`timestamp <= $${idx++}`);
      params.push(filter.end_date);
    }
    if (filter.is_sensitive !== undefined) {
      conditions.push(`is_sensitive = $${idx++}`);
      params.push(filter.is_sensitive);
    }
    if (filter.is_suspicious !== undefined) {
      conditions.push(`is_suspicious = $${idx++}`);
      params.push(filter.is_suspicious);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filter.limit ?? 50;
    const offset = filter.offset ?? 0;

    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM audit_logs ${where}`,
      params,
    );

    const dataResult = await pool.query(
      `SELECT * FROM audit_logs ${where} ORDER BY timestamp DESC LIMIT $${idx++} OFFSET $${idx}`,
      [...params, limit, offset],
    );

    return {
      logs: dataResult.rows.map(this.mapRow),
      total: parseInt(countResult.rows[0].total as string, 10),
    };
  }

  /**
   * Export audit logs as CSV string.
   */
  async exportCsv(filter: AuditLogFilter): Promise<string> {
    // Remove pagination for full export
    const exportFilter = { ...filter, limit: undefined, offset: undefined };
    const allLogs = await this.searchAll(exportFilter);

    const header = 'id,tenant_id,user_id,action,resource_type,resource_id,ip_address,timestamp,is_sensitive,is_suspicious,suspicious_reason';
    const rows = allLogs.map((log) =>
      [
        log.id,
        log.tenant_id ?? '',
        log.user_id,
        this.escapeCsv(log.action),
        this.escapeCsv(log.resource_type),
        this.escapeCsv(log.resource_id),
        log.ip_address ?? '',
        log.timestamp.toISOString(),
        log.is_sensitive ? 'true' : 'false',
        log.is_suspicious ? 'true' : 'false',
        this.escapeCsv(log.suspicious_reason ?? ''),
      ].join(','),
    );

    return [header, ...rows].join('\n');
  }

  /**
   * Check for suspicious activity patterns and flag if detected.
   */
  async checkSuspiciousActivity(userId: string, action: string): Promise<boolean> {
    const pool = getPool();
    let flagged = false;

    for (const rule of SUSPICIOUS_RULES) {
      const matchAction = this.actionMatchesRule(action, rule.type);
      if (!matchAction) continue;

      const result = await pool.query(
        `SELECT COUNT(*) as cnt FROM audit_logs
         WHERE user_id = $1 AND action = $2
           AND timestamp > NOW() - INTERVAL '${rule.window_minutes} minutes'`,
        [userId, action],
      );

      const count = parseInt(result.rows[0].cnt as string, 10);
      if (count >= rule.threshold) {
        // Flag the most recent entry as suspicious
        await pool.query(
          `UPDATE audit_logs SET is_suspicious = TRUE, suspicious_reason = $1
           WHERE user_id = $2 AND action = $3
             AND timestamp > NOW() - INTERVAL '${rule.window_minutes} minutes'
           ORDER BY timestamp DESC LIMIT 1`,
          [rule.description, userId, action],
        );
        flagged = true;
      }
    }

    return flagged;
  }

  /**
   * Get suspicious activity entries.
   */
  async getSuspiciousActivity(
    filter: { tenant_id?: string; limit?: number; offset?: number } = {},
  ): Promise<AuditLogResult> {
    return this.search({
      ...filter,
      is_suspicious: true,
    });
  }

  /**
   * Get the configured retention period in years.
   */
  getRetentionYears(): number {
    return AUDIT_RETENTION_YEARS;
  }

  /**
   * Get the earliest allowed deletion date (3 years from now going back).
   */
  getRetentionCutoffDate(): Date {
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - AUDIT_RETENTION_YEARS);
    return cutoff;
  }

  // ── Private helpers ─────────────────────────────────────────

  private async searchAll(filter: AuditLogFilter): Promise<AuditLog[]> {
    const pool = getPool();
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (filter.tenant_id) {
      conditions.push(`tenant_id = $${idx++}`);
      params.push(filter.tenant_id);
    }
    if (filter.user_id) {
      conditions.push(`user_id = $${idx++}`);
      params.push(filter.user_id);
    }
    if (filter.action) {
      conditions.push(`action = $${idx++}`);
      params.push(filter.action);
    }
    if (filter.resource_type) {
      conditions.push(`resource_type = $${idx++}`);
      params.push(filter.resource_type);
    }
    if (filter.start_date) {
      conditions.push(`timestamp >= $${idx++}`);
      params.push(filter.start_date);
    }
    if (filter.end_date) {
      conditions.push(`timestamp <= $${idx++}`);
      params.push(filter.end_date);
    }
    if (filter.is_sensitive !== undefined) {
      conditions.push(`is_sensitive = $${idx++}`);
      params.push(filter.is_sensitive);
    }
    if (filter.is_suspicious !== undefined) {
      conditions.push(`is_suspicious = $${idx++}`);
      params.push(filter.is_suspicious);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT * FROM audit_logs ${where} ORDER BY timestamp DESC`,
      params,
    );

    return result.rows.map(this.mapRow);
  }

  private actionMatchesRule(action: string, ruleType: string): boolean {
    const mapping: Record<string, string[]> = {
      failed_login: ['failed_login'],
      unusual_data_access: ['view_user_data', 'export_user_data', 'view_farm_data', 'export_farm_data', 'view_financial_data', 'data_export', 'bulk_export', 'view_personal_info'],
      bulk_deletion: ['delete_user', 'delete_farm', 'delete_tenant', 'remove_user'],
    };
    return mapping[ruleType]?.includes(action) ?? false;
  }

  private escapeCsv(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  private mapRow(row: Record<string, unknown>): AuditLog {
    return {
      id: row.id as string,
      tenant_id: row.tenant_id as string | undefined,
      user_id: row.user_id as string,
      action: row.action as string,
      resource_type: row.resource_type as string,
      resource_id: row.resource_id as string,
      changes: row.changes
        ? typeof row.changes === 'string'
          ? JSON.parse(row.changes)
          : (row.changes as Record<string, unknown>)
        : undefined,
      ip_address: row.ip_address as string | undefined,
      user_agent: row.user_agent as string | undefined,
      timestamp: new Date(row.timestamp as string),
      is_sensitive: row.is_sensitive as boolean | undefined,
      is_suspicious: row.is_suspicious as boolean | undefined,
      suspicious_reason: row.suspicious_reason as string | undefined,
    };
  }
}
