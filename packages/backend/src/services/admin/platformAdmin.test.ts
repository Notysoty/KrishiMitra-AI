import { PlatformAdminService } from './PlatformAdminService';
import { TenantType, TenantStatus } from '../../types/enums';

const mockQuery = jest.fn();

jest.mock('../../db/pool', () => ({
  getPool: () => ({ query: mockQuery }),
}));

describe('PlatformAdminService', () => {
  let service: PlatformAdminService;
  const actorId = 'platform-admin-1';

  const baseTenantRow = {
    id: 'tenant-1',
    name: 'Test FPO',
    type: TenantType.FPO,
    status: TenantStatus.ACTIVE,
    branding: JSON.stringify({}),
    settings: JSON.stringify({
      supported_languages: ['en', 'hi'],
      supported_crops: [],
      supported_markets: [],
      default_region: '',
    }),
    limits: JSON.stringify({
      max_users: 1000,
      max_storage_gb: 10,
      max_api_requests_per_day: 10000,
    }),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  beforeEach(() => {
    service = new PlatformAdminService();
    mockQuery.mockReset();
  });

  // ── createTenant ──────────────────────────────────────────

  describe('createTenant', () => {
    it('should create tenant with admin user and audit log', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [baseTenantRow] });
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await service.createTenant({
        name: 'Test FPO', type: TenantType.FPO,
        admin_name: 'Admin', admin_phone: '+911234567890',
      }, actorId);

      expect(result.tenant.name).toBe('Test FPO');
      expect(result.tenant.type).toBe(TenantType.FPO);
      expect(result.admin_user_id).toBeDefined();
      expect(mockQuery).toHaveBeenCalledTimes(3);
      expect(mockQuery.mock.calls[0][0]).toContain('INSERT INTO tenants');
      expect(mockQuery.mock.calls[1][0]).toContain('INSERT INTO users');
      expect(mockQuery.mock.calls[2][0]).toContain('INSERT INTO audit_logs');
    });

    it('should apply custom settings and limits', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [baseTenantRow] });
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await service.createTenant({
        name: 'Custom Org', type: TenantType.NGO,
        admin_name: 'Admin', admin_phone: '+910000000000',
        settings: { supported_languages: ['en', 'hi', 'ta'] },
        limits: { max_users: 500 },
      }, actorId);

      const settingsArg = mockQuery.mock.calls[0][1][5];
      const parsed = JSON.parse(settingsArg);
      expect(parsed.supported_languages).toEqual(['en', 'hi', 'ta']);

      const limitsArg = mockQuery.mock.calls[0][1][6];
      const parsedLimits = JSON.parse(limitsArg);
      expect(parsedLimits.max_users).toBe(500);
    });

    it('should set admin email when provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [baseTenantRow] });
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await service.createTenant({
        name: 'Test', type: TenantType.FPO,
        admin_name: 'Admin', admin_phone: '+911111111111',
        admin_email: 'admin@test.com',
      }, actorId);

      expect(mockQuery.mock.calls[1][1]).toContain('admin@test.com');
    });
  });

  // ── suspendTenant ─────────────────────────────────────────

  describe('suspendTenant', () => {
    it('should suspend an active tenant', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ status: TenantStatus.ACTIVE }] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...baseTenantRow, status: TenantStatus.SUSPENDED }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await service.suspendTenant('tenant-1', 'TOS violation', actorId);
      expect(result.status).toBe(TenantStatus.SUSPENDED);
    });

    it('should throw when tenant not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await expect(
        service.suspendTenant('nonexistent', 'reason', actorId),
      ).rejects.toThrow('Tenant not found');
    });

    it('should throw when trying to suspend a deleted tenant', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ status: TenantStatus.DELETED }] });
      await expect(
        service.suspendTenant('tenant-1', 'reason', actorId),
      ).rejects.toThrow('Cannot suspend a deleted tenant');
    });
  });

  // ── deleteTenant ──────────────────────────────────────────

  describe('deleteTenant', () => {
    it('should soft-delete tenant and remove associated data', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'tenant-1' }] });
      mockQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE status
      mockQuery.mockResolvedValueOnce({ rows: [] }); // DELETE conversations
      mockQuery.mockResolvedValueOnce({ rows: [] }); // DELETE knowledge_articles
      mockQuery.mockResolvedValueOnce({ rows: [] }); // DELETE input_logs
      mockQuery.mockResolvedValueOnce({ rows: [] }); // DELETE crops
      mockQuery.mockResolvedValueOnce({ rows: [] }); // DELETE farms
      mockQuery.mockResolvedValueOnce({ rows: [] }); // DELETE users
      mockQuery.mockResolvedValueOnce({ rows: [] }); // audit log

      const result = await service.deleteTenant('tenant-1', actorId);

      expect(result).toBe(true);
      expect(mockQuery.mock.calls[1][1]).toContain(TenantStatus.DELETED);
      expect(mockQuery.mock.calls[2][0]).toContain('DELETE FROM conversations');
      expect(mockQuery.mock.calls[7][0]).toContain('DELETE FROM users');
      expect(mockQuery.mock.calls[8][0]).toContain('INSERT INTO audit_logs');
    });

    it('should return false when tenant not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const result = await service.deleteTenant('nonexistent', actorId);
      expect(result).toBe(false);
    });
  });

  // ── getTenantDashboard ────────────────────────────────────

  describe('getTenantDashboard', () => {
    it('should return all tenants with status and user counts', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 't1', name: 'Org A', type: TenantType.FPO, status: TenantStatus.ACTIVE, user_count: '25', created_at: new Date().toISOString() },
          { id: 't2', name: 'Org B', type: TenantType.NGO, status: TenantStatus.SUSPENDED, user_count: '10', created_at: new Date().toISOString() },
        ],
      });

      const dashboard = await service.getTenantDashboard();

      expect(dashboard).toHaveLength(2);
      expect(dashboard[0].id).toBe('t1');
      expect(dashboard[0].status).toBe(TenantStatus.ACTIVE);
      expect(dashboard[0].user_count).toBe(25);
      expect(dashboard[0].resource_usage).toHaveProperty('storage_used_gb');
      expect(dashboard[0].resource_usage).toHaveProperty('api_requests_today');
    });

    it('should return empty array when no tenants exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const dashboard = await service.getTenantDashboard();
      expect(dashboard).toEqual([]);
    });
  });

  // ── getGlobalAIConfig ─────────────────────────────────────

  describe('getGlobalAIConfig', () => {
    it('should return stored AI config', async () => {
      const storedConfig = {
        default_model: 'gpt-4-turbo',
        default_provider: 'openai',
        safety_policies: { block_chemical_dosage: true, block_prompt_injection: true, block_prohibited_topics: true, min_confidence_threshold: 0.6 },
        rate_limits: { max_queries_per_user_per_day: 200 },
      };
      mockQuery.mockResolvedValueOnce({ rows: [{ value: storedConfig }] });

      const config = await service.getGlobalAIConfig();
      expect(config.default_model).toBe('gpt-4-turbo');
      expect(config.safety_policies.min_confidence_threshold).toBe(0.6);
    });

    it('should return default config when none stored', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const config = await service.getGlobalAIConfig();
      expect(config.default_model).toBe('gpt-4');
      expect(config.default_provider).toBe('openai');
      expect(config.safety_policies.block_chemical_dosage).toBe(true);
      expect(config.rate_limits.max_queries_per_user_per_day).toBe(100);
    });

    it('should parse JSON string value', async () => {
      const storedConfig = JSON.stringify({
        default_model: 'claude-3', default_provider: 'anthropic',
        safety_policies: { block_chemical_dosage: true, block_prompt_injection: true, block_prohibited_topics: true, min_confidence_threshold: 0.5 },
        rate_limits: { max_queries_per_user_per_day: 100 },
      });
      mockQuery.mockResolvedValueOnce({ rows: [{ value: storedConfig }] });
      const config = await service.getGlobalAIConfig();
      expect(config.default_model).toBe('claude-3');
    });
  });

  // ── updateGlobalAIConfig ──────────────────────────────────

  describe('updateGlobalAIConfig', () => {
    it('should merge partial config and save', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await service.updateGlobalAIConfig({ default_model: 'gpt-4-turbo' }, actorId);
      expect(result.default_model).toBe('gpt-4-turbo');
      expect(result.default_provider).toBe('openai');
      expect(result.safety_policies.block_chemical_dosage).toBe(true);
    });

    it('should merge safety policies deeply', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await service.updateGlobalAIConfig(
        { safety_policies: { min_confidence_threshold: 0.7 } } as any, actorId,
      );
      expect(result.safety_policies.min_confidence_threshold).toBe(0.7);
      expect(result.safety_policies.block_chemical_dosage).toBe(true);
    });

    it('should log the config change with previous and updated values', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await service.updateGlobalAIConfig({ default_model: 'new-model' }, actorId);
      const auditCall = mockQuery.mock.calls[2];
      expect(auditCall[0]).toContain('INSERT INTO audit_logs');
      const changes = JSON.parse(auditCall[1][5]);
      expect(changes.previous).toBeDefined();
      expect(changes.updated).toBeDefined();
    });
  });

  // ── getCrossTenantAnalytics ───────────────────────────────

  describe('getCrossTenantAnalytics', () => {
    it('should return aggregated analytics across all tenants', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '5' }] });
      mockQuery.mockResolvedValueOnce({ rows: [{ active: '3' }] });
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '150' }] });
      mockQuery.mockResolvedValueOnce({ rows: [{ active: '80' }] });
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '500' }] });
      mockQuery.mockResolvedValueOnce({
        rows: [
          { type: TenantType.FPO, count: '3' },
          { type: TenantType.NGO, count: '2' },
        ],
      });

      const analytics = await service.getCrossTenantAnalytics();
      expect(analytics.total_tenants).toBe(5);
      expect(analytics.active_tenants).toBe(3);
      expect(analytics.total_users).toBe(150);
      expect(analytics.active_users).toBe(80);
      expect(analytics.total_ai_interactions).toBe(500);
      expect(analytics.tenants_by_type).toEqual({ fpo: 3, ngo: 2 });
    });
  });

  // ── requestDataExport ─────────────────────────────────────

  describe('requestDataExport', () => {
    it('should create a data export request', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'tenant-1' }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await service.requestDataExport('tenant-1', actorId);
      expect(result.id).toBeDefined();
      expect(result.tenant_id).toBe('tenant-1');
      expect(result.status).toBe('pending');
      expect(result.requested_at).toBeInstanceOf(Date);
    });

    it('should throw when tenant not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await expect(service.requestDataExport('nonexistent', actorId)).rejects.toThrow('Tenant not found');
    });
  });

  // ── getFeatureFlags ───────────────────────────────────────

  describe('getFeatureFlags', () => {
    it('should return feature flags from tenant settings', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ settings: { feature_flags: { ai_chat: true, disease_classification: false } } }],
      });
      const flags = await service.getFeatureFlags('tenant-1');
      expect(flags).toEqual({ ai_chat: true, disease_classification: false });
    });

    it('should return empty object when no feature flags set', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ settings: { supported_languages: ['en'] } }] });
      const flags = await service.getFeatureFlags('tenant-1');
      expect(flags).toEqual({});
    });

    it('should parse JSON string settings', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ settings: JSON.stringify({ feature_flags: { voice: true } }) }],
      });
      const flags = await service.getFeatureFlags('tenant-1');
      expect(flags).toEqual({ voice: true });
    });

    it('should throw when tenant not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await expect(service.getFeatureFlags('nonexistent')).rejects.toThrow('Tenant not found');
    });
  });

  // ── updateFeatureFlags ────────────────────────────────────

  describe('updateFeatureFlags', () => {
    it('should merge new flags with existing ones', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ settings: { feature_flags: { ai_chat: true } } }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await service.updateFeatureFlags('tenant-1', { disease_classification: true }, actorId);
      expect(result).toEqual({ ai_chat: true, disease_classification: true });
    });

    it('should override existing flag values', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ settings: { feature_flags: { ai_chat: true } } }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await service.updateFeatureFlags('tenant-1', { ai_chat: false }, actorId);
      expect(result.ai_chat).toBe(false);
    });

    it('should throw when tenant not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await expect(service.updateFeatureFlags('nonexistent', { ai_chat: true }, actorId)).rejects.toThrow('Tenant not found');
    });

    it('should log previous and updated flags', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ settings: { feature_flags: { ai_chat: true } } }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await service.updateFeatureFlags('tenant-1', { voice: true }, actorId);
      const auditCall = mockQuery.mock.calls[2];
      expect(auditCall[0]).toContain('INSERT INTO audit_logs');
      const changes = JSON.parse(auditCall[1][5]);
      expect(changes.previous_flags).toEqual({ ai_chat: true });
      expect(changes.updated_flags).toEqual({ ai_chat: true, voice: true });
    });
  });

  // ── scheduleMaintenance ───────────────────────────────────

  describe('scheduleMaintenance', () => {
    it('should schedule maintenance at least 24 hours in advance', async () => {
      const futureStart = new Date(Date.now() + 48 * 60 * 60 * 1000);
      const futureEnd = new Date(futureStart.getTime() + 2 * 60 * 60 * 1000);

      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await service.scheduleMaintenance({
        title: 'DB Upgrade', description: 'Upgrading PostgreSQL',
        scheduled_start: futureStart, scheduled_end: futureEnd,
      }, actorId);

      expect(result.id).toBeDefined();
      expect(result.title).toBe('DB Upgrade');
      expect(result.notification_sent).toBe(false);
    });

    it('should reject maintenance scheduled less than 24 hours in advance', async () => {
      const tooSoon = new Date(Date.now() + 12 * 60 * 60 * 1000);
      const end = new Date(tooSoon.getTime() + 2 * 60 * 60 * 1000);

      await expect(
        service.scheduleMaintenance({
          title: 'Urgent Fix', description: 'Emergency',
          scheduled_start: tooSoon, scheduled_end: end,
        }, actorId),
      ).rejects.toThrow('Maintenance must be scheduled at least 24 hours in advance');
    });
  });

  // ── getMaintenanceWindows ─────────────────────────────────

  describe('getMaintenanceWindows', () => {
    it('should return maintenance windows', async () => {
      const now = new Date();
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'mw-1', title: 'Upgrade A', description: 'Desc A', scheduled_start: now.toISOString(), scheduled_end: new Date(now.getTime() + 3600000).toISOString(), notification_sent: true, created_at: now.toISOString() },
          { id: 'mw-2', title: 'Upgrade B', description: 'Desc B', scheduled_start: new Date(now.getTime() + 86400000).toISOString(), scheduled_end: new Date(now.getTime() + 90000000).toISOString(), notification_sent: false, created_at: now.toISOString() },
        ],
      });

      const windows = await service.getMaintenanceWindows();
      expect(windows).toHaveLength(2);
      expect(windows[0].title).toBe('Upgrade A');
      expect(windows[0].notification_sent).toBe(true);
      expect(windows[1].notification_sent).toBe(false);
    });

    it('should return empty array when no maintenance windows', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const windows = await service.getMaintenanceWindows();
      expect(windows).toEqual([]);
    });
  });

  // ── Audit logging resilience ──────────────────────────────

  describe('audit logging', () => {
    it('should not throw when audit log write fails', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [baseTenantRow] });
      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockRejectedValueOnce(new Error('DB connection lost'));

      const result = await service.createTenant({
        name: 'Test', type: TenantType.FPO,
        admin_name: 'Admin', admin_phone: '+911111111111',
      }, actorId);

      expect(result.tenant.name).toBe('Test FPO');
    });
  });
});
