import { TenantAdminService, MAX_BULK_IMPORT_USERS } from './TenantAdminService';
import { Role, ArticleStatus, TenantType, TenantStatus } from '../../types/enums';

// ── Mock pg Pool ───────────────────────────────────────────────
const mockQuery = jest.fn();

jest.mock('../../db/pool', () => ({
  getPool: () => ({ query: mockQuery }),
}));

describe('TenantAdminService', () => {
  let service: TenantAdminService;

  beforeEach(() => {
    service = new TenantAdminService();
    mockQuery.mockReset();
  });

  const tenantId = 'tenant-1';
  const actorId = 'admin-1';
  const actorRoles = [Role.TENANT_ADMIN];

  const baseTenantRow = {
    id: tenantId,
    name: 'Test Org',
    type: TenantType.FPO,
    status: TenantStatus.ACTIVE,
    branding: { logo_url: 'https://example.com/logo.png' },
    settings: { supported_languages: ['en', 'hi'], supported_crops: ['wheat'], supported_markets: ['Delhi'], default_region: 'North India' },
    limits: { max_users: 1000, max_storage_gb: 10, max_api_requests_per_day: 10000 },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // ── updateBranding ──────────────────────────────────────────

  describe('updateBranding', () => {
    it('should update tenant branding and log the action', async () => {
      // SELECT current branding
      mockQuery.mockResolvedValueOnce({ rows: [{ branding: { logo_url: 'old.png' }, name: 'Old Name' }] });
      // UPDATE tenant
      mockQuery.mockResolvedValueOnce({ rows: [{ ...baseTenantRow, branding: { logo_url: 'new.png', primary_color: '#ff0000' } }] });
      // INSERT audit log
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await service.updateBranding(tenantId, { logo_url: 'new.png', primary_color: '#ff0000' }, actorId);

      expect(result.id).toBe(tenantId);
      expect(mockQuery).toHaveBeenCalledTimes(3);
      // Verify audit log was written
      expect(mockQuery.mock.calls[2][0]).toContain('INSERT INTO audit_logs');
    });

    it('should update org name when provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ branding: {}, name: 'Old Name' }] });
      mockQuery.mockResolvedValueOnce({ rows: [{ ...baseTenantRow, name: 'New Org' }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await service.updateBranding(tenantId, { org_name: 'New Org' }, actorId);
      expect(result.name).toBe('New Org');
      // Verify the UPDATE query used the new name
      expect(mockQuery.mock.calls[1][1]).toContain('New Org');
    });

    it('should throw when tenant not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await expect(service.updateBranding(tenantId, {}, actorId)).rejects.toThrow('Tenant not found');
    });
  });

  // ── addUser ─────────────────────────────────────────────────

  describe('addUser', () => {
    it('should add a user and log the action', async () => {
      const userId = 'new-user-1';
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: userId, tenant_id: tenantId, phone: '+911234567890',
          name: 'Test Farmer', email: null, roles: [Role.FARMER],
          language_preference: 'en', created_at: new Date().toISOString(),
        }],
      });
      // audit log
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const user = await service.addUser(tenantId, {
        phone: '+911234567890',
        name: 'Test Farmer',
        roles: [Role.FARMER],
      }, actorId, actorRoles);

      expect(user.phone).toBe('+911234567890');
      expect(user.roles).toEqual([Role.FARMER]);
    });

    it('should reject unauthorized role assignment', async () => {
      await expect(
        service.addUser(tenantId, {
          phone: '+911234567890',
          name: 'Test',
          roles: [Role.PLATFORM_ADMIN],
        }, actorId, actorRoles),
      ).rejects.toThrow('Not authorized to assign role');
    });
  });


  // ── removeUser ──────────────────────────────────────────────

  describe('removeUser', () => {
    it('should remove a user and return true', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'user-1' }] });
      mockQuery.mockResolvedValueOnce({ rows: [] }); // audit log

      const result = await service.removeUser(tenantId, 'user-1', actorId);
      expect(result).toBe(true);
    });

    it('should return false when user not found', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });

      const result = await service.removeUser(tenantId, 'nonexistent', actorId);
      expect(result).toBe(false);
    });
  });

  // ── assignRole ──────────────────────────────────────────────

  describe('assignRole', () => {
    it('should update user roles and log the change', async () => {
      // SELECT current roles
      mockQuery.mockResolvedValueOnce({ rows: [{ roles: [Role.FARMER] }] });
      // UPDATE roles
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'user-1', tenant_id: tenantId, phone: '+91123',
          name: 'Test', roles: [Role.FARMER, Role.FIELD_OFFICER],
          language_preference: 'en', created_at: new Date().toISOString(),
        }],
      });
      // audit log
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const user = await service.assignRole(tenantId, 'user-1', [Role.FARMER, Role.FIELD_OFFICER], actorId, actorRoles);
      expect(user.roles).toEqual([Role.FARMER, Role.FIELD_OFFICER]);
    });

    it('should throw when user not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await expect(
        service.assignRole(tenantId, 'nonexistent', [Role.FARMER], actorId, actorRoles),
      ).rejects.toThrow('User not found');
    });

    it('should reject unauthorized role assignment', async () => {
      await expect(
        service.assignRole(tenantId, 'user-1', [Role.PLATFORM_ADMIN], actorId, actorRoles),
      ).rejects.toThrow('Not authorized to assign role');
    });
  });

  // ── listUsers ───────────────────────────────────────────────

  describe('listUsers', () => {
    it('should return paginated users with total count', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '3' }] });
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'u1', tenant_id: tenantId, phone: '+91111', name: 'A', roles: [Role.FARMER], language_preference: 'en', created_at: new Date().toISOString() },
          { id: 'u2', tenant_id: tenantId, phone: '+91222', name: 'B', roles: [Role.BUYER], language_preference: 'hi', created_at: new Date().toISOString() },
        ],
      });

      const result = await service.listUsers(tenantId, { limit: 2, offset: 0 });
      expect(result.total).toBe(3);
      expect(result.users).toHaveLength(2);
    });
  });

  // ── updateRegionalPreferences ───────────────────────────────

  describe('updateRegionalPreferences', () => {
    it('should merge and update regional preferences', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ settings: { default_region: 'North India' } }] });
      mockQuery.mockResolvedValueOnce({ rows: [{ ...baseTenantRow, settings: { default_region: 'South India', supported_crops: ['rice'] } }] });
      mockQuery.mockResolvedValueOnce({ rows: [] }); // audit

      const result = await service.updateRegionalPreferences(tenantId, {
        default_region: 'South India',
        supported_crops: ['rice'],
      }, actorId);

      expect(result.settings.default_region).toBe('South India');
    });

    it('should throw when tenant not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await expect(
        service.updateRegionalPreferences(tenantId, {}, actorId),
      ).rejects.toThrow('Tenant not found');
    });
  });

  // ── processContentApproval ──────────────────────────────────

  describe('processContentApproval', () => {
    const articleRow = {
      id: 'article-1', tenant_id: tenantId, title: 'Test Article',
      content: 'Content', language: 'en', category: 'pest',
      tags: ['wheat'], source: 'expert', status: ArticleStatus.PENDING_REVIEW,
      created_by: 'user-1', approved_by: null,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      version: 1,
    };

    it('should approve an article pending review', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [articleRow] });
      mockQuery.mockResolvedValueOnce({ rows: [{ ...articleRow, status: ArticleStatus.APPROVED, approved_by: actorId, version: 2 }] });
      mockQuery.mockResolvedValueOnce({ rows: [] }); // audit

      const article = await service.processContentApproval(tenantId, {
        article_id: 'article-1',
        action: 'approve',
      }, actorId);

      expect(article.status).toBe(ArticleStatus.APPROVED);
      expect(article.version).toBe(2);
    });

    it('should reject an article and revert to draft', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [articleRow] });
      mockQuery.mockResolvedValueOnce({ rows: [{ ...articleRow, status: ArticleStatus.DRAFT, version: 2 }] });
      mockQuery.mockResolvedValueOnce({ rows: [] }); // audit

      const article = await service.processContentApproval(tenantId, {
        article_id: 'article-1',
        action: 'reject',
        reviewer_notes: 'Needs more detail',
      }, actorId);

      expect(article.status).toBe(ArticleStatus.DRAFT);
    });

    it('should throw when article not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await expect(
        service.processContentApproval(tenantId, { article_id: 'nope', action: 'approve' }, actorId),
      ).rejects.toThrow('Article not found');
    });

    it('should throw when article is not pending review', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...articleRow, status: ArticleStatus.APPROVED }] });
      await expect(
        service.processContentApproval(tenantId, { article_id: 'article-1', action: 'approve' }, actorId),
      ).rejects.toThrow('not pending review');
    });
  });

  // ── getUsageAnalytics ───────────────────────────────────────

  describe('getUsageAnalytics', () => {
    it('should return usage analytics', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '50' }] });
      mockQuery.mockResolvedValueOnce({ rows: [{ active: '30' }] });
      mockQuery.mockResolvedValueOnce({ rows: [{ interactions: '120' }] });
      mockQuery.mockResolvedValueOnce({
        rows: [
          { resource_type: 'farm', user_count: '25' },
          { resource_type: 'ai_chat', user_count: '15' },
        ],
      });

      const analytics = await service.getUsageAnalytics(tenantId);
      expect(analytics.total_users).toBe(50);
      expect(analytics.active_users).toBe(30);
      expect(analytics.ai_interactions).toBe(120);
      expect(analytics.feature_adoption.farm).toBe(25);
      expect(analytics.feature_adoption.ai_chat).toBe(15);
    });
  });

  // ── bulkImportUsers ─────────────────────────────────────────

  describe('bulkImportUsers', () => {
    it('should import valid users and report results', async () => {
      // First user: addUser INSERT + audit log
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'u1', tenant_id: tenantId, phone: '+91111', name: 'User 1',
          roles: [Role.FARMER], language_preference: 'en', created_at: new Date().toISOString(),
        }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] }); // audit for addUser

      // Second user: addUser INSERT + audit log
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'u2', tenant_id: tenantId, phone: '+91222', name: 'User 2',
          roles: [Role.FARMER], language_preference: 'hi', created_at: new Date().toISOString(),
        }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] }); // audit for addUser

      // Bulk import audit log
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await service.bulkImportUsers(tenantId, [
        { phone: '+91111', name: 'User 1', roles: 'farmer' },
        { phone: '+91222', name: 'User 2', roles: 'farmer', language_preference: 'hi' },
      ], actorId, actorRoles);

      expect(result.imported).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should report errors for invalid rows', async () => {
      // Bulk import audit log
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await service.bulkImportUsers(tenantId, [
        { phone: '', name: '', roles: 'farmer' },
      ], actorId, actorRoles);

      expect(result.imported).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.errors[0].row).toBe(1);
    });

    it('should throw when exceeding max import limit', async () => {
      const tooMany = Array.from({ length: MAX_BULK_IMPORT_USERS + 1 }, (_, i) => ({
        phone: `+91${i}`, name: `User ${i}`, roles: 'farmer',
      }));

      await expect(
        service.bulkImportUsers(tenantId, tooMany, actorId, actorRoles),
      ).rejects.toThrow(`Bulk import limited to ${MAX_BULK_IMPORT_USERS} users`);
    });

    it('should reject rows with invalid roles', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // bulk audit

      const result = await service.bulkImportUsers(tenantId, [
        { phone: '+91111', name: 'User 1', roles: 'invalid_role' },
      ], actorId, actorRoles);

      expect(result.failed).toBe(1);
      expect(result.errors[0].message).toContain('Invalid role');
    });
  });

  // ── setNotificationDefaults ─────────────────────────────────

  describe('setNotificationDefaults', () => {
    it('should update notification defaults in tenant settings', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ settings: { default_region: 'North India' } }] });
      mockQuery.mockResolvedValueOnce({
        rows: [{
          ...baseTenantRow,
          settings: {
            default_region: 'North India',
            notification_defaults: { in_app: true, sms: false, email: false, price_alerts: true, weather_alerts: true, pest_alerts: true },
          },
        }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] }); // audit

      const result = await service.setNotificationDefaults(tenantId, {
        in_app: true, sms: false, email: false,
        price_alerts: true, weather_alerts: true, pest_alerts: true,
      }, actorId);

      expect(result.settings).toBeDefined();
    });

    it('should throw when tenant not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await expect(
        service.setNotificationDefaults(tenantId, {
          in_app: true, sms: false, email: false,
          price_alerts: true, weather_alerts: true, pest_alerts: true,
        }, actorId),
      ).rejects.toThrow('Tenant not found');
    });
  });

  // ── getAuditLogs ────────────────────────────────────────────

  describe('getAuditLogs', () => {
    it('should return paginated audit logs', async () => {
      const now = new Date().toISOString();
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '2' }] });
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'log-1', tenant_id: tenantId, user_id: actorId, action: 'add_user', resource_type: 'user', resource_id: 'u1', changes: '{}', timestamp: now },
          { id: 'log-2', tenant_id: tenantId, user_id: actorId, action: 'update_branding', resource_type: 'tenant', resource_id: tenantId, changes: null, timestamp: now },
        ],
      });

      const result = await service.getAuditLogs(tenantId);
      expect(result.total).toBe(2);
      expect(result.logs).toHaveLength(2);
      expect(result.logs[0].action).toBe('add_user');
    });

    it('should filter by action and userId', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '1' }] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'log-1', tenant_id: tenantId, user_id: actorId, action: 'add_user', resource_type: 'user', resource_id: 'u1', changes: null, timestamp: new Date().toISOString() }],
      });

      const result = await service.getAuditLogs(tenantId, { action: 'add_user', userId: actorId });
      expect(result.total).toBe(1);

      // Verify query includes filters
      const countCall = mockQuery.mock.calls[0];
      expect(countCall[0]).toContain('action');
      expect(countCall[0]).toContain('user_id');
    });
  });
});
