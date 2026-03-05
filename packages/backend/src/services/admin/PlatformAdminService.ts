import { getPool } from '../../db/pool';
import { Role, TenantStatus, TenantType } from '../../types/enums';
import { Tenant } from '../../types/tenant';
import { AuditLog } from '../../types/audit';

// ── Interfaces ──────────────────────────────────────────────────

export interface CreateTenantInput {
  name: string;
  type: TenantType;
  admin_name: string;
  admin_phone: string;
  admin_email?: string;
  settings?: Partial<Tenant['settings']>;
  limits?: Partial<Tenant['limits']>;
}

export interface TenantDashboardEntry {
  id: string;
  name: string;
  type: TenantType;
  status: TenantStatus;
  user_count: number;
  resource_usage: {
    storage_used_gb: number;
    api_requests_today: number;
  };
  created_at: Date;
}

export interface GlobalAIConfig {
  default_model: string;
  default_provider: string;
  safety_policies: {
    block_chemical_dosage: boolean;
    block_prompt_injection: boolean;
    block_prohibited_topics: boolean;
    min_confidence_threshold: number;
  };
  rate_limits: {
    max_queries_per_user_per_day: number;
  };
}

export interface CrossTenantAnalytics {
  total_tenants: number;
  active_tenants: number;
  total_users: number;
  active_users: number;
  total_ai_interactions: number;
  tenants_by_type: Record<string, number>;
}

export interface DataExportRequest {
  id: string;
  tenant_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  requested_at: Date;
  completed_at?: Date;
  download_url?: string;
}

export interface FeatureFlags {
  [feature: string]: boolean;
}

export interface MaintenanceWindow {
  id: string;
  title: string;
  description: string;
  scheduled_start: Date;
  scheduled_end: Date;
  notification_sent: boolean;
  created_at: Date;
}

export interface ScheduleMaintenanceInput {
  title: string;
  description: string;
  scheduled_start: Date;
  scheduled_end: Date;
}

// ── PlatformAdminService ────────────────────────────────────────

export class PlatformAdminService {

  // ── Tenant Provisioning ───────────────────────────────────

  async createTenant(
    input: CreateTenantInput,
    actorId: string,
  ): Promise<{ tenant: Tenant; admin_user_id: string }> {
    const pool = getPool();

    const defaultSettings = {
      supported_languages: ['en', 'hi'],
      supported_crops: [],
      supported_markets: [],
      default_region: '',
      ...input.settings,
    };

    const defaultLimits = {
      max_users: 1000,
      max_storage_gb: 10,
      max_api_requests_per_day: 10000,
      ...input.limits,
    };

    const tenantId = crypto.randomUUID();
    const tenantResult = await pool.query(
      `INSERT INTO tenants (id, name, type, status, branding, settings, limits, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       RETURNING *`,
      [
        tenantId,
        input.name,
        input.type,
        TenantStatus.ACTIVE,
        JSON.stringify({}),
        JSON.stringify(defaultSettings),
        JSON.stringify(defaultLimits),
      ],
    );

    // Create initial Tenant_Admin user
    const adminUserId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO users (id, tenant_id, phone, email, name, roles, language_preference, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'en', NOW())`,
      [
        adminUserId,
        tenantId,
        input.admin_phone,
        input.admin_email ?? null,
        input.admin_name,
        [Role.TENANT_ADMIN],
      ],
    );

    await this.logAction(null, actorId, 'create_tenant', 'tenant', tenantId, {
      name: input.name,
      type: input.type,
      admin_user_id: adminUserId,
    });

    return {
      tenant: this.mapRowToTenant(tenantResult.rows[0]),
      admin_user_id: adminUserId,
    };
  }

  async suspendTenant(
    tenantId: string,
    reason: string,
    actorId: string,
  ): Promise<Tenant> {
    const pool = getPool();

    const current = await pool.query('SELECT status FROM tenants WHERE id = $1', [tenantId]);
    if (current.rows.length === 0) throw new Error('Tenant not found');

    if (current.rows[0].status === TenantStatus.DELETED) {
      throw new Error('Cannot suspend a deleted tenant');
    }

    const result = await pool.query(
      `UPDATE tenants SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [TenantStatus.SUSPENDED, tenantId],
    );

    await this.logAction(null, actorId, 'suspend_tenant', 'tenant', tenantId, { reason });

    return this.mapRowToTenant(result.rows[0]);
  }

  async deleteTenant(
    tenantId: string,
    actorId: string,
  ): Promise<boolean> {
    const pool = getPool();

    const current = await pool.query('SELECT id FROM tenants WHERE id = $1', [tenantId]);
    if (current.rows.length === 0) return false;

    // Soft-delete: mark as deleted, preserve audit logs
    await pool.query(
      `UPDATE tenants SET status = $1, updated_at = NOW() WHERE id = $2`,
      [TenantStatus.DELETED, tenantId],
    );

    // Remove tenant data but preserve audit logs
    await pool.query('DELETE FROM conversations WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM knowledge_articles WHERE tenant_id = $1', [tenantId]);
    await pool.query(
      `DELETE FROM input_logs WHERE farm_id IN (SELECT id FROM farms WHERE tenant_id = $1)`,
      [tenantId],
    );
    await pool.query(
      `DELETE FROM crops WHERE farm_id IN (SELECT id FROM farms WHERE tenant_id = $1)`,
      [tenantId],
    );
    await pool.query('DELETE FROM farms WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM users WHERE tenant_id = $1', [tenantId]);

    await this.logAction(null, actorId, 'delete_tenant', 'tenant', tenantId);

    return true;
  }

  // ── Dashboard ─────────────────────────────────────────────

  async getTenantDashboard(): Promise<TenantDashboardEntry[]> {
    const pool = getPool();

    const result = await pool.query(
      `SELECT t.id, t.name, t.type, t.status, t.created_at,
              COALESCE(u.user_count, 0) AS user_count
       FROM tenants t
       LEFT JOIN (
         SELECT tenant_id, COUNT(*) AS user_count
         FROM users GROUP BY tenant_id
       ) u ON u.tenant_id = t.id
       ORDER BY t.created_at DESC`,
    );

    return result.rows.map((row: Record<string, unknown>) => ({
      id: row.id as string,
      name: row.name as string,
      type: row.type as TenantType,
      status: row.status as TenantStatus,
      user_count: parseInt(row.user_count as string, 10),
      resource_usage: {
        storage_used_gb: 0, // Placeholder — real implementation reads S3 metrics
        api_requests_today: 0,
      },
      created_at: new Date(row.created_at as string),
    }));
  }

  // ── Global AI Configuration ───────────────────────────────

  async getGlobalAIConfig(): Promise<GlobalAIConfig> {
    const pool = getPool();

    const result = await pool.query(
      `SELECT value FROM platform_config WHERE key = 'ai_config'`,
    );

    if (result.rows.length === 0) {
      return this.defaultAIConfig();
    }

    const raw = result.rows[0].value;
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  }

  async updateGlobalAIConfig(
    config: Partial<GlobalAIConfig>,
    actorId: string,
  ): Promise<GlobalAIConfig> {
    const pool = getPool();

    const current = await this.getGlobalAIConfig();
    const merged: GlobalAIConfig = {
      ...current,
      ...config,
      safety_policies: { ...current.safety_policies, ...config.safety_policies },
      rate_limits: { ...current.rate_limits, ...config.rate_limits },
    };

    await pool.query(
      `INSERT INTO platform_config (key, value, updated_at)
       VALUES ('ai_config', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
      [JSON.stringify(merged)],
    );

    await this.logAction(null, actorId, 'update_ai_config', 'platform_config', 'ai_config', {
      previous: current,
      updated: merged,
    });

    return merged;
  }

  // ── Cross-Tenant Analytics ────────────────────────────────

  async getCrossTenantAnalytics(): Promise<CrossTenantAnalytics> {
    const pool = getPool();

    const tenantCount = await pool.query('SELECT COUNT(*) as total FROM tenants');
    const activeCount = await pool.query(
      `SELECT COUNT(*) as active FROM tenants WHERE status = $1`,
      [TenantStatus.ACTIVE],
    );
    const userCount = await pool.query('SELECT COUNT(*) as total FROM users');
    const activeUsers = await pool.query(
      `SELECT COUNT(*) as active FROM users WHERE last_login >= NOW() - INTERVAL '30 days'`,
    );
    const aiInteractions = await pool.query(
      `SELECT COUNT(*) as total FROM conversations WHERE created_at >= NOW() - INTERVAL '30 days'`,
    );
    const tenantsByType = await pool.query(
      'SELECT type, COUNT(*) as count FROM tenants GROUP BY type',
    );

    const byType: Record<string, number> = {};
    for (const row of tenantsByType.rows) {
      byType[row.type as string] = parseInt(row.count as string, 10);
    }

    return {
      total_tenants: parseInt(tenantCount.rows[0].total as string, 10),
      active_tenants: parseInt(activeCount.rows[0].active as string, 10),
      total_users: parseInt(userCount.rows[0].total as string, 10),
      active_users: parseInt(activeUsers.rows[0].active as string, 10),
      total_ai_interactions: parseInt(aiInteractions.rows[0].total as string, 10),
      tenants_by_type: byType,
    };
  }

  // ── Data Export ───────────────────────────────────────────

  async requestDataExport(
    tenantId: string,
    actorId: string,
  ): Promise<DataExportRequest> {
    const pool = getPool();

    // Verify tenant exists
    const tenant = await pool.query('SELECT id FROM tenants WHERE id = $1', [tenantId]);
    if (tenant.rows.length === 0) throw new Error('Tenant not found');

    const exportId = crypto.randomUUID();
    const now = new Date();

    await pool.query(
      `INSERT INTO data_export_requests (id, tenant_id, status, requested_at)
       VALUES ($1, $2, 'pending', $3)`,
      [exportId, tenantId, now],
    );

    await this.logAction(null, actorId, 'request_data_export', 'data_export', exportId, {
      tenant_id: tenantId,
    });

    return {
      id: exportId,
      tenant_id: tenantId,
      status: 'pending',
      requested_at: now,
    };
  }

  // ── Feature Flags ─────────────────────────────────────────

  async getFeatureFlags(tenantId: string): Promise<FeatureFlags> {
    const pool = getPool();

    const result = await pool.query(
      `SELECT settings FROM tenants WHERE id = $1`,
      [tenantId],
    );

    if (result.rows.length === 0) throw new Error('Tenant not found');

    const settings = typeof result.rows[0].settings === 'string'
      ? JSON.parse(result.rows[0].settings)
      : (result.rows[0].settings ?? {});

    return settings.feature_flags ?? {};
  }

  async updateFeatureFlags(
    tenantId: string,
    flags: FeatureFlags,
    actorId: string,
  ): Promise<FeatureFlags> {
    const pool = getPool();

    const current = await pool.query('SELECT settings FROM tenants WHERE id = $1', [tenantId]);
    if (current.rows.length === 0) throw new Error('Tenant not found');

    const existingSettings = typeof current.rows[0].settings === 'string'
      ? JSON.parse(current.rows[0].settings)
      : (current.rows[0].settings ?? {});

    const existingFlags = existingSettings.feature_flags ?? {};
    const mergedFlags = { ...existingFlags, ...flags };
    const mergedSettings = { ...existingSettings, feature_flags: mergedFlags };

    await pool.query(
      'UPDATE tenants SET settings = $1, updated_at = NOW() WHERE id = $2',
      [JSON.stringify(mergedSettings), tenantId],
    );

    await this.logAction(null, actorId, 'update_feature_flags', 'tenant', tenantId, {
      previous_flags: existingFlags,
      updated_flags: mergedFlags,
    });

    return mergedFlags;
  }

  // ── Maintenance Scheduling ────────────────────────────────

  async scheduleMaintenance(
    input: ScheduleMaintenanceInput,
    actorId: string,
  ): Promise<MaintenanceWindow> {
    const pool = getPool();

    const startDate = new Date(input.scheduled_start);
    const now = new Date();
    const hoursUntilStart = (startDate.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (hoursUntilStart < 24) {
      throw new Error('Maintenance must be scheduled at least 24 hours in advance');
    }

    const id = crypto.randomUUID();

    await pool.query(
      `INSERT INTO maintenance_windows (id, title, description, scheduled_start, scheduled_end, notification_sent, created_at)
       VALUES ($1, $2, $3, $4, $5, false, NOW())`,
      [id, input.title, input.description, input.scheduled_start, input.scheduled_end],
    );

    await this.logAction(null, actorId, 'schedule_maintenance', 'maintenance', id, {
      title: input.title,
      scheduled_start: input.scheduled_start,
      scheduled_end: input.scheduled_end,
    });

    return {
      id,
      title: input.title,
      description: input.description,
      scheduled_start: startDate,
      scheduled_end: new Date(input.scheduled_end),
      notification_sent: false,
      created_at: now,
    };
  }

  async getMaintenanceWindows(): Promise<MaintenanceWindow[]> {
    const pool = getPool();

    const result = await pool.query(
      `SELECT * FROM maintenance_windows ORDER BY scheduled_start DESC LIMIT 50`,
    );

    return result.rows.map((row: Record<string, unknown>) => ({
      id: row.id as string,
      title: row.title as string,
      description: row.description as string,
      scheduled_start: new Date(row.scheduled_start as string),
      scheduled_end: new Date(row.scheduled_end as string),
      notification_sent: row.notification_sent as boolean,
      created_at: new Date(row.created_at as string),
    }));
  }

  // ── Private Helpers ───────────────────────────────────────

  private defaultAIConfig(): GlobalAIConfig {
    return {
      default_model: 'gpt-4',
      default_provider: 'openai',
      safety_policies: {
        block_chemical_dosage: true,
        block_prompt_injection: true,
        block_prohibited_topics: true,
        min_confidence_threshold: 0.5,
      },
      rate_limits: {
        max_queries_per_user_per_day: 100,
      },
    };
  }

  private async logAction(
    tenantId: string | null,
    actorId: string,
    action: string,
    resourceType: string,
    resourceId: string,
    changes?: Record<string, unknown>,
  ): Promise<void> {
    try {
      const pool = getPool();
      await pool.query(
        `INSERT INTO audit_logs (id, tenant_id, user_id, action, resource_type, resource_id, changes, timestamp)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW())`,
        [tenantId, actorId, action, resourceType, resourceId, changes ? JSON.stringify(changes) : null],
      );
    } catch (err) {
      console.error('Failed to write audit log:', err);
    }
  }

  private mapRowToTenant(row: Record<string, unknown>): Tenant {
    return {
      id: row.id as string,
      name: row.name as string,
      type: row.type as Tenant['type'],
      status: row.status as Tenant['status'],
      branding: typeof row.branding === 'string' ? JSON.parse(row.branding) : (row.branding ?? {}),
      settings: typeof row.settings === 'string' ? JSON.parse(row.settings) : (row.settings ?? {}),
      limits: typeof row.limits === 'string' ? JSON.parse(row.limits) : (row.limits ?? {}),
      created_at: new Date(row.created_at as string),
      updated_at: new Date(row.updated_at as string),
    };
  }
}
