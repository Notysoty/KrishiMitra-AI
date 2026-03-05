import request from 'supertest';
import express from 'express';
import { Role, ArticleStatus, TenantType, TenantStatus } from '../types/enums';

// ── Mocks (must be declared before jest.mock for hoisting) ─────

const mockServiceInstance = {
  updateBranding: jest.fn(),
  addUser: jest.fn(),
  removeUser: jest.fn(),
  assignRole: jest.fn(),
  listUsers: jest.fn(),
  updateRegionalPreferences: jest.fn(),
  processContentApproval: jest.fn(),
  getPendingContent: jest.fn(),
  getUsageAnalytics: jest.fn(),
  bulkImportUsers: jest.fn(),
  setNotificationDefaults: jest.fn(),
  getAuditLogs: jest.fn(),
};

jest.mock('../services/admin/TenantAdminService', () => ({
  TenantAdminService: jest.fn().mockImplementation(() => mockServiceInstance),
  MAX_BULK_IMPORT_USERS: 1000,
}));

jest.mock('../services/auth', () => ({
  verifyToken: () => ({
    userId: 'admin-1',
    tenantId: 'tenant-1',
    roles: ['tenant_admin'],
    sessionId: 'session-1',
  }),
}));

// Import after mocks are set up
import adminRoutes from './admin';

const app = express();
app.use(express.json());
app.use('/api/v1/admin', adminRoutes);

describe('Admin Routes', () => {
  const authHeader = { Authorization: 'Bearer valid-token' };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const baseTenant = {
    id: 'tenant-1',
    name: 'Test Org',
    type: TenantType.FPO,
    status: TenantStatus.ACTIVE,
    branding: {},
    settings: {},
    limits: {},
    created_at: new Date(),
    updated_at: new Date(),
  };

  // ── PUT /branding ─────────────────────────────────────────

  describe('PUT /api/v1/admin/branding', () => {
    it('should update branding', async () => {
      mockServiceInstance.updateBranding.mockResolvedValue({ ...baseTenant, branding: { logo_url: 'new.png' } });

      const res = await request(app)
        .put('/api/v1/admin/branding')
        .set(authHeader)
        .send({ logo_url: 'new.png' });

      expect(res.status).toBe(200);
      expect(res.body.branding.logo_url).toBe('new.png');
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .put('/api/v1/admin/branding')
        .send({ logo_url: 'new.png' });

      expect(res.status).toBe(401);
    });
  });

  // ── GET /users ────────────────────────────────────────────

  describe('GET /api/v1/admin/users', () => {
    it('should list users', async () => {
      mockServiceInstance.listUsers.mockResolvedValue({ users: [], total: 0 });

      const res = await request(app)
        .get('/api/v1/admin/users')
        .set(authHeader);

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(0);
    });
  });

  // ── POST /users ───────────────────────────────────────────

  describe('POST /api/v1/admin/users', () => {
    it('should add a user', async () => {
      mockServiceInstance.addUser.mockResolvedValue({
        id: 'new-user', tenant_id: 'tenant-1', phone: '+91111',
        name: 'New User', roles: [Role.FARMER], language_preference: 'en',
        created_at: new Date(),
      });

      const res = await request(app)
        .post('/api/v1/admin/users')
        .set(authHeader)
        .send({ phone: '+91111', name: 'New User', roles: [Role.FARMER] });

      expect(res.status).toBe(201);
      expect(res.body.phone).toBe('+91111');
    });

    it('should reject missing required fields', async () => {
      const res = await request(app)
        .post('/api/v1/admin/users')
        .set(authHeader)
        .send({ phone: '+91111' });

      expect(res.status).toBe(400);
    });

    it('should reject invalid roles', async () => {
      const res = await request(app)
        .post('/api/v1/admin/users')
        .set(authHeader)
        .send({ phone: '+91111', name: 'Test', roles: ['invalid_role'] });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid role');
    });

    it('should return 403 for unauthorized role assignment', async () => {
      mockServiceInstance.addUser.mockRejectedValue(new Error('Not authorized to assign role: platform_admin'));

      const res = await request(app)
        .post('/api/v1/admin/users')
        .set(authHeader)
        .send({ phone: '+91111', name: 'Test', roles: [Role.FARMER] });

      expect(res.status).toBe(403);
    });
  });


  // ── DELETE /users/:id ─────────────────────────────────────

  describe('DELETE /api/v1/admin/users/:id', () => {
    it('should remove a user', async () => {
      mockServiceInstance.removeUser.mockResolvedValue(true);

      const res = await request(app)
        .delete('/api/v1/admin/users/user-1')
        .set(authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 404 when user not found', async () => {
      mockServiceInstance.removeUser.mockResolvedValue(false);

      const res = await request(app)
        .delete('/api/v1/admin/users/nonexistent')
        .set(authHeader);

      expect(res.status).toBe(404);
    });
  });

  // ── PUT /users/:id/roles ──────────────────────────────────

  describe('PUT /api/v1/admin/users/:id/roles', () => {
    it('should assign roles', async () => {
      mockServiceInstance.assignRole.mockResolvedValue({
        id: 'user-1', tenant_id: 'tenant-1', phone: '+91111',
        name: 'Test', roles: [Role.FARMER, Role.FIELD_OFFICER],
        language_preference: 'en', created_at: new Date(),
      });

      const res = await request(app)
        .put('/api/v1/admin/users/user-1/roles')
        .set(authHeader)
        .send({ roles: [Role.FARMER, Role.FIELD_OFFICER] });

      expect(res.status).toBe(200);
      expect(res.body.roles).toEqual([Role.FARMER, Role.FIELD_OFFICER]);
    });

    it('should reject empty roles', async () => {
      const res = await request(app)
        .put('/api/v1/admin/users/user-1/roles')
        .set(authHeader)
        .send({ roles: [] });

      expect(res.status).toBe(400);
    });

    it('should return 404 when user not found', async () => {
      mockServiceInstance.assignRole.mockRejectedValue(new Error('User not found'));

      const res = await request(app)
        .put('/api/v1/admin/users/nonexistent/roles')
        .set(authHeader)
        .send({ roles: [Role.FARMER] });

      expect(res.status).toBe(404);
    });
  });

  // ── POST /users/bulk-import ───────────────────────────────

  describe('POST /api/v1/admin/users/bulk-import', () => {
    it('should import users', async () => {
      mockServiceInstance.bulkImportUsers.mockResolvedValue({ imported: 2, failed: 0, errors: [] });

      const res = await request(app)
        .post('/api/v1/admin/users/bulk-import')
        .set(authHeader)
        .send({ users: [
          { phone: '+91111', name: 'User 1', roles: 'farmer' },
          { phone: '+91222', name: 'User 2', roles: 'farmer' },
        ]});

      expect(res.status).toBe(200);
      expect(res.body.imported).toBe(2);
    });

    it('should reject missing users array', async () => {
      const res = await request(app)
        .post('/api/v1/admin/users/bulk-import')
        .set(authHeader)
        .send({});

      expect(res.status).toBe(400);
    });

    it('should reject exceeding max import limit', async () => {
      const tooMany = Array.from({ length: 1001 }, (_, i) => ({
        phone: `+91${i}`, name: `User ${i}`, roles: 'farmer',
      }));

      const res = await request(app)
        .post('/api/v1/admin/users/bulk-import')
        .set(authHeader)
        .send({ users: tooMany });

      expect(res.status).toBe(400);
    });
  });

  // ── PUT /preferences/regional ─────────────────────────────

  describe('PUT /api/v1/admin/preferences/regional', () => {
    it('should update regional preferences', async () => {
      mockServiceInstance.updateRegionalPreferences.mockResolvedValue({
        ...baseTenant,
        settings: { supported_crops: ['rice'] },
      });

      const res = await request(app)
        .put('/api/v1/admin/preferences/regional')
        .set(authHeader)
        .send({ supported_crops: ['rice'] });

      expect(res.status).toBe(200);
    });
  });

  // ── PUT /preferences/notifications ────────────────────────

  describe('PUT /api/v1/admin/preferences/notifications', () => {
    it('should update notification defaults', async () => {
      mockServiceInstance.setNotificationDefaults.mockResolvedValue(baseTenant);

      const res = await request(app)
        .put('/api/v1/admin/preferences/notifications')
        .set(authHeader)
        .send({ in_app: true, sms: false, email: false, price_alerts: true, weather_alerts: true, pest_alerts: true });

      expect(res.status).toBe(200);
    });
  });

  // ── GET /content/pending ──────────────────────────────────

  describe('GET /api/v1/admin/content/pending', () => {
    it('should return pending content', async () => {
      mockServiceInstance.getPendingContent.mockResolvedValue({ articles: [], total: 0 });

      const res = await request(app)
        .get('/api/v1/admin/content/pending')
        .set(authHeader);

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(0);
    });
  });

  // ── POST /content/review ──────────────────────────────────

  describe('POST /api/v1/admin/content/review', () => {
    it('should approve content', async () => {
      mockServiceInstance.processContentApproval.mockResolvedValue({
        id: 'article-1', status: ArticleStatus.APPROVED,
      });

      const res = await request(app)
        .post('/api/v1/admin/content/review')
        .set(authHeader)
        .send({ article_id: 'article-1', action: 'approve' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(ArticleStatus.APPROVED);
    });

    it('should reject invalid action', async () => {
      const res = await request(app)
        .post('/api/v1/admin/content/review')
        .set(authHeader)
        .send({ article_id: 'article-1', action: 'invalid' });

      expect(res.status).toBe(400);
    });

    it('should return 404 when article not found', async () => {
      mockServiceInstance.processContentApproval.mockRejectedValue(new Error('Article not found'));

      const res = await request(app)
        .post('/api/v1/admin/content/review')
        .set(authHeader)
        .send({ article_id: 'nope', action: 'approve' });

      expect(res.status).toBe(404);
    });
  });

  // ── GET /analytics ────────────────────────────────────────

  describe('GET /api/v1/admin/analytics', () => {
    it('should return usage analytics', async () => {
      mockServiceInstance.getUsageAnalytics.mockResolvedValue({
        total_users: 50, active_users: 30, ai_interactions: 120,
        feature_adoption: { farm: 25 },
      });

      const res = await request(app)
        .get('/api/v1/admin/analytics')
        .set(authHeader);

      expect(res.status).toBe(200);
      expect(res.body.total_users).toBe(50);
      expect(res.body.active_users).toBe(30);
    });
  });

  // ── GET /audit-logs ───────────────────────────────────────

  describe('GET /api/v1/admin/audit-logs', () => {
    it('should return audit logs', async () => {
      mockServiceInstance.getAuditLogs.mockResolvedValue({ logs: [], total: 0 });

      const res = await request(app)
        .get('/api/v1/admin/audit-logs')
        .set(authHeader);

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(0);
    });

    it('should pass filter parameters', async () => {
      mockServiceInstance.getAuditLogs.mockResolvedValue({ logs: [], total: 0 });

      const res = await request(app)
        .get('/api/v1/admin/audit-logs?action=add_user&userId=admin-1')
        .set(authHeader);

      expect(res.status).toBe(200);
      expect(mockServiceInstance.getAuditLogs).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({ action: 'add_user', userId: 'admin-1' }),
      );
    });
  });
});
