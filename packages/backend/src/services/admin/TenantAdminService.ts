import { getPool } from '../../db/pool';
import { Role, ArticleStatus } from '../../types/enums';
import { Tenant } from '../../types/tenant';
import { User } from '../../types/user';
import { AuditLog } from '../../types/audit';
import { KnowledgeArticle } from '../../types/knowledge';
import { canAssignRole } from '../../middleware/rbac';

// ── Constants ───────────────────────────────────────────────────

export const MAX_BULK_IMPORT_USERS = 1_000;

// ── Interfaces ──────────────────────────────────────────────────

export interface BrandingConfig {
  logo_url?: string;
  primary_color?: string;
  secondary_color?: string;
  org_name?: string;
}

export interface RegionalPreferences {
  supported_languages?: string[];
  supported_crops?: string[];
  supported_markets?: string[];
  default_region?: string;
}

export interface AddUserInput {
  phone: string;
  name: string;
  email?: string;
  roles: Role[];
  language_preference?: string;
}

export interface NotificationDefaults {
  in_app: boolean;
  sms: boolean;
  email: boolean;
  price_alerts: boolean;
  weather_alerts: boolean;
  pest_alerts: boolean;
}

export interface UsageAnalytics {
  active_users: number;
  total_users: number;
  ai_interactions: number;
  feature_adoption: Record<string, number>;
}

export interface CsvUserRow {
  phone: string;
  name: string;
  email?: string;
  roles: string;
  language_preference?: string;
}

export interface BulkImportResult {
  imported: number;
  failed: number;
  errors: Array<{ row: number; message: string }>;
}

export interface ContentApprovalInput {
  article_id: string;
  action: 'approve' | 'reject';
  reviewer_notes?: string;
}

// ── TenantAdminService ──────────────────────────────────────────

export class TenantAdminService {

  // ── Tenant Branding ─────────────────────────────────────────

  async updateBranding(
    tenantId: string,
    branding: BrandingConfig,
    actorId: string,
  ): Promise<Tenant> {
    const pool = getPool();

    const current = await pool.query('SELECT branding, name FROM tenants WHERE id = $1', [tenantId]);
    if (current.rows.length === 0) throw new Error('Tenant not found');

    const existingBranding = current.rows[0].branding ?? {};
    const merged = { ...existingBranding, ...branding };

    // If org_name is provided, update the tenant name as well
    const newName = branding.org_name ?? current.rows[0].name;

    const result = await pool.query(
      `UPDATE tenants SET branding = $1, name = $2, updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [JSON.stringify(merged), newName, tenantId],
    );

    await this.logAction(tenantId, actorId, 'update_branding', 'tenant', tenantId, {
      previous: existingBranding,
      updated: merged,
    });

    return this.mapRowToTenant(result.rows[0]);
  }

  // ── User Management ─────────────────────────────────────────

  async addUser(
    tenantId: string,
    input: AddUserInput,
    actorId: string,
    actorRoles: string[],
  ): Promise<User> {
    const pool = getPool();

    // Validate role assignment privileges
    for (const role of input.roles) {
      if (!canAssignRole(actorRoles, role)) {
        throw new Error(`Not authorized to assign role: ${role}`);
      }
    }

    const id = crypto.randomUUID();
    const result = await pool.query(
      `INSERT INTO users (id, tenant_id, phone, email, name, roles, language_preference, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       RETURNING *`,
      [id, tenantId, input.phone, input.email ?? null, input.name, input.roles, input.language_preference ?? 'en'],
    );

    await this.logAction(tenantId, actorId, 'add_user', 'user', id, {
      phone: input.phone,
      name: input.name,
      roles: input.roles,
    });

    return this.mapRowToUser(result.rows[0]);
  }

  async removeUser(
    tenantId: string,
    userId: string,
    actorId: string,
  ): Promise<boolean> {
    const pool = getPool();

    const result = await pool.query(
      'DELETE FROM users WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [userId, tenantId],
    );

    if ((result.rowCount ?? 0) === 0) return false;

    await this.logAction(tenantId, actorId, 'remove_user', 'user', userId);
    return true;
  }

  async assignRole(
    tenantId: string,
    userId: string,
    roles: Role[],
    actorId: string,
    actorRoles: string[],
  ): Promise<User> {
    const pool = getPool();

    for (const role of roles) {
      if (!canAssignRole(actorRoles, role)) {
        throw new Error(`Not authorized to assign role: ${role}`);
      }
    }

    const current = await pool.query(
      'SELECT roles FROM users WHERE id = $1 AND tenant_id = $2',
      [userId, tenantId],
    );
    if (current.rows.length === 0) throw new Error('User not found');

    const previousRoles = current.rows[0].roles;

    const result = await pool.query(
      'UPDATE users SET roles = $1 WHERE id = $2 AND tenant_id = $3 RETURNING *',
      [roles, userId, tenantId],
    );

    await this.logAction(tenantId, actorId, 'assign_role', 'user', userId, {
      previous_roles: previousRoles,
      new_roles: roles,
    });

    return this.mapRowToUser(result.rows[0]);
  }

  async listUsers(
    tenantId: string,
    options: { limit?: number; offset?: number } = {},
  ): Promise<{ users: User[]; total: number }> {
    const pool = getPool();
    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;

    const countResult = await pool.query(
      'SELECT COUNT(*) as total FROM users WHERE tenant_id = $1',
      [tenantId],
    );

    const result = await pool.query(
      'SELECT * FROM users WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      [tenantId, limit, offset],
    );

    return {
      users: result.rows.map(this.mapRowToUser),
      total: parseInt(countResult.rows[0].total, 10),
    };
  }

  // ── Regional Preferences ────────────────────────────────────

  async updateRegionalPreferences(
    tenantId: string,
    preferences: RegionalPreferences,
    actorId: string,
  ): Promise<Tenant> {
    const pool = getPool();

    const current = await pool.query('SELECT settings FROM tenants WHERE id = $1', [tenantId]);
    if (current.rows.length === 0) throw new Error('Tenant not found');

    const existingSettings = current.rows[0].settings ?? {};
    const merged = { ...existingSettings, ...preferences };

    const result = await pool.query(
      'UPDATE tenants SET settings = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [JSON.stringify(merged), tenantId],
    );

    await this.logAction(tenantId, actorId, 'update_regional_preferences', 'tenant', tenantId, {
      previous: existingSettings,
      updated: merged,
    });

    return this.mapRowToTenant(result.rows[0]);
  }


  // ── Content Approval Workflow ───────────────────────────────

  async processContentApproval(
    tenantId: string,
    input: ContentApprovalInput,
    actorId: string,
  ): Promise<KnowledgeArticle> {
    const pool = getPool();

    const article = await pool.query(
      'SELECT * FROM knowledge_articles WHERE id = $1 AND tenant_id = $2',
      [input.article_id, tenantId],
    );
    if (article.rows.length === 0) throw new Error('Article not found');

    const currentStatus = article.rows[0].status;
    if (currentStatus !== ArticleStatus.PENDING_REVIEW) {
      throw new Error(`Article is not pending review (current status: ${currentStatus})`);
    }

    const newStatus = input.action === 'approve'
      ? ArticleStatus.APPROVED
      : ArticleStatus.DRAFT;

    const result = await pool.query(
      `UPDATE knowledge_articles
       SET status = $1, approved_by = $2, updated_at = NOW(), version = version + 1
       WHERE id = $3 AND tenant_id = $4
       RETURNING *`,
      [newStatus, actorId, input.article_id, tenantId],
    );

    await this.logAction(tenantId, actorId, `content_${input.action}`, 'knowledge_article', input.article_id, {
      previous_status: currentStatus,
      new_status: newStatus,
      reviewer_notes: input.reviewer_notes,
    });

    return this.mapRowToArticle(result.rows[0]);
  }

  async getPendingContent(
    tenantId: string,
    options: { limit?: number; offset?: number } = {},
  ): Promise<{ articles: KnowledgeArticle[]; total: number }> {
    const pool = getPool();
    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;

    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM knowledge_articles
       WHERE tenant_id = $1 AND status = $2`,
      [tenantId, ArticleStatus.PENDING_REVIEW],
    );

    const result = await pool.query(
      `SELECT * FROM knowledge_articles
       WHERE tenant_id = $1 AND status = $2
       ORDER BY created_at DESC LIMIT $3 OFFSET $4`,
      [tenantId, ArticleStatus.PENDING_REVIEW, limit, offset],
    );

    return {
      articles: result.rows.map(this.mapRowToArticle),
      total: parseInt(countResult.rows[0].total, 10),
    };
  }

  // ── Usage Analytics ─────────────────────────────────────────

  async getUsageAnalytics(tenantId: string): Promise<UsageAnalytics> {
    const pool = getPool();

    // Total users
    const totalResult = await pool.query(
      'SELECT COUNT(*) as total FROM users WHERE tenant_id = $1',
      [tenantId],
    );

    // Active users (logged in within last 30 days)
    const activeResult = await pool.query(
      `SELECT COUNT(*) as active FROM users
       WHERE tenant_id = $1 AND last_login >= NOW() - INTERVAL '30 days'`,
      [tenantId],
    );

    // AI interactions (conversations in last 30 days)
    const aiResult = await pool.query(
      `SELECT COUNT(*) as interactions FROM conversations
       WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '30 days'`,
      [tenantId],
    );

    // Feature adoption: count distinct users per resource_type in audit_logs
    const adoptionResult = await pool.query(
      `SELECT resource_type, COUNT(DISTINCT user_id) as user_count
       FROM audit_logs
       WHERE tenant_id = $1 AND timestamp >= NOW() - INTERVAL '30 days'
       GROUP BY resource_type`,
      [tenantId],
    );

    const featureAdoption: Record<string, number> = {};
    for (const row of adoptionResult.rows) {
      featureAdoption[row.resource_type as string] = parseInt(row.user_count as string, 10);
    }

    return {
      total_users: parseInt(totalResult.rows[0].total as string, 10),
      active_users: parseInt(activeResult.rows[0].active as string, 10),
      ai_interactions: parseInt(aiResult.rows[0].interactions as string, 10),
      feature_adoption: featureAdoption,
    };
  }

  // ── Bulk User Import ────────────────────────────────────────

  async bulkImportUsers(
    tenantId: string,
    csvRows: CsvUserRow[],
    actorId: string,
    actorRoles: string[],
  ): Promise<BulkImportResult> {
    if (csvRows.length > MAX_BULK_IMPORT_USERS) {
      throw new Error(`Bulk import limited to ${MAX_BULK_IMPORT_USERS} users for MVP`);
    }

    const result: BulkImportResult = { imported: 0, failed: 0, errors: [] };

    for (let i = 0; i < csvRows.length; i++) {
      const row = csvRows[i];
      try {
        const roles = row.roles.split(',').map(r => r.trim()) as Role[];

        // Validate roles
        const validRoles = Object.values(Role);
        for (const role of roles) {
          if (!validRoles.includes(role)) {
            throw new Error(`Invalid role: ${role}`);
          }
          if (!canAssignRole(actorRoles, role)) {
            throw new Error(`Not authorized to assign role: ${role}`);
          }
        }

        if (!row.phone || !row.name) {
          throw new Error('Phone and name are required');
        }

        await this.addUser(tenantId, {
          phone: row.phone,
          name: row.name,
          email: row.email,
          roles,
          language_preference: row.language_preference,
        }, actorId, actorRoles);

        result.imported++;
      } catch (err) {
        result.failed++;
        result.errors.push({
          row: i + 1,
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    await this.logAction(tenantId, actorId, 'bulk_import_users', 'user', 'bulk', {
      total_rows: csvRows.length,
      imported: result.imported,
      failed: result.failed,
    });

    return result;
  }


  // ── Notification Preference Defaults ────────────────────────

  async setNotificationDefaults(
    tenantId: string,
    defaults: NotificationDefaults,
    actorId: string,
  ): Promise<Tenant> {
    const pool = getPool();

    const current = await pool.query('SELECT settings FROM tenants WHERE id = $1', [tenantId]);
    if (current.rows.length === 0) throw new Error('Tenant not found');

    const existingSettings = current.rows[0].settings ?? {};
    const merged = { ...existingSettings, notification_defaults: defaults };

    const result = await pool.query(
      'UPDATE tenants SET settings = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [JSON.stringify(merged), tenantId],
    );

    await this.logAction(tenantId, actorId, 'update_notification_defaults', 'tenant', tenantId, {
      notification_defaults: defaults,
    });

    return this.mapRowToTenant(result.rows[0]);
  }

  // ── Audit Log ───────────────────────────────────────────────

  async getAuditLogs(
    tenantId: string,
    options: { limit?: number; offset?: number; action?: string; userId?: string } = {},
  ): Promise<{ logs: AuditLog[]; total: number }> {
    const pool = getPool();
    const conditions: string[] = ['tenant_id = $1'];
    const params: unknown[] = [tenantId];
    let paramIdx = 2;

    if (options.action) {
      conditions.push(`action = $${paramIdx++}`);
      params.push(options.action);
    }
    if (options.userId) {
      conditions.push(`user_id = $${paramIdx++}`);
      params.push(options.userId);
    }

    const where = conditions.join(' AND ');
    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;

    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM audit_logs WHERE ${where}`,
      params,
    );

    const result = await pool.query(
      `SELECT * FROM audit_logs WHERE ${where} ORDER BY timestamp DESC LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
      [...params, limit, offset],
    );

    return {
      logs: result.rows.map(this.mapRowToAuditLog),
      total: parseInt(countResult.rows[0].total as string, 10),
    };
  }

  // ── Private Helpers ─────────────────────────────────────────

  private async logAction(
    tenantId: string,
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

  private mapRowToUser(row: Record<string, unknown>): User {
    return {
      id: row.id as string,
      tenant_id: row.tenant_id as string,
      phone: row.phone as string,
      email: row.email as string | undefined,
      name: row.name as string,
      roles: row.roles as Role[],
      language_preference: row.language_preference as string,
      created_at: new Date(row.created_at as string),
      last_login: row.last_login ? new Date(row.last_login as string) : undefined,
    };
  }

  private mapRowToArticle(row: Record<string, unknown>): KnowledgeArticle {
    return {
      id: row.id as string,
      tenant_id: row.tenant_id as string,
      title: row.title as string,
      content: row.content as string,
      language: row.language as string,
      category: row.category as string,
      tags: row.tags as string[],
      source: row.source as string,
      source_url: row.source_url as string | undefined,
      status: row.status as ArticleStatus,
      created_by: row.created_by as string,
      approved_by: row.approved_by as string | undefined,
      created_at: new Date(row.created_at as string),
      updated_at: new Date(row.updated_at as string),
      version: row.version as number,
    };
  }

  private mapRowToAuditLog(row: Record<string, unknown>): AuditLog {
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
    };
  }
}
