import request from 'supertest';
import express from 'express';
import { TenantType, TenantStatus } from '../types/enums';

const mockServiceInstance = {
  createTenant: jest.fn(),
  suspendTenant: jest.fn(),
  deleteTenant: jest.fn(),
  getTenantDashboard: jest.fn(),
  getGlobalAIConfig: jest.fn(),
  updateGlobalAIConfig: jest.fn(),
  getCrossTenantAnalytics: jest.fn(),
  requestDataExport: jest.fn(),
  getFeatureFlags: jest.fn(),
  updateFeatureFlags: jest.fn(),
  scheduleMaintenance: jest.fn(),
  getMaintenanceWindows: jest.fn(),
};

jest.mock('../services/admin/PlatformAdminService', () => ({
  PlatformAdminService: jest.fn().mockImplementation(() => mockServiceInstance),
}));

jest.mock('../services/auth', () => ({
  verifyToken: () => ({
    userId: 'padmin-1',
    tenantId: 'tenant-1',
    roles: ['platform_admin'],
    sessionId: 'session-1',
  }),
}));

import platformAdminRoutes from './platform-admin';

const app = express();
app.use(express.json());
app.use('/api/v1/platform', platformAdminRoutes);

describe('Platform Admin Routes', () => {
  const authHeader = { Authorization: 'Bearer valid-token' };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── POST /tenants ─────────────────────────────────────────

  describe('POST /api/v1/platform/tenants', () => {
    it('should create a tenant', async () => {
      mockServiceInstance.createTenant.mockResolvedValue({
        tenant: { id: 't1', name: 'New Org', type: TenantType.FPO, status: TenantStatus.ACTIVE },
        admin_user_id: 'admin-1',
      });

      const res = await request(app)
        .post('/api/v1/platform/tenants')
        .set(authHeader)
        .send({ name: 'New Org', type: TenantType.FPO, admin_name: 'Admin', admin_phone: '+911234567890' });

      expect(res.status).toBe(201);
      expect(res.body.tenant.name).toBe('New Org');
      expect(res.body.admin_user_id).toBe('admin-1');
    });

    it('should reject missing required fields', async () => {
      const res = await request(app)
        .post('/api/v1/platform/tenants')
        .set(authHeader)
        .send({ name: 'Org' });

      expect(res.status).toBe(400);
    });

    it('should reject invalid tenant type', async () => {
      const res = await request(app)
        .post('/api/v1/platform/tenants')
        .set(authHeader)
        .send({ name: 'Org', type: 'invalid', admin_name: 'Admin', admin_phone: '+91111' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid tenant type');
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/v1/platform/tenants')
        .send({ name: 'Org', type: TenantType.FPO, admin_name: 'Admin', admin_phone: '+91111' });

      expect(res.status).toBe(401);
    });
  });

  // ── POST /tenants/:id/suspend ─────────────────────────────

  describe('POST /api/v1/platform/tenants/:id/suspend', () => {
    it('should suspend a tenant', async () => {
      mockServiceInstance.suspendTenant.mockResolvedValue({
        id: 't1', name: 'Org', status: TenantStatus.SUSPENDED,
      });

      const res = await request(app)
        .post('/api/v1/platform/tenants/t1/suspend')
        .set(authHeader)
        .send({ reason: 'TOS violation' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(TenantStatus.SUSPENDED);
    });

    it('should reject missing reason', async () => {
      const res = await request(app)
        .post('/api/v1/platform/tenants/t1/suspend')
        .set(authHeader)
        .send({});

      expect(res.status).toBe(400);
    });

    it('should return 404 when tenant not found', async () => {
      mockServiceInstance.suspendTenant.mockRejectedValue(new Error('Tenant not found'));

      const res = await request(app)
        .post('/api/v1/platform/tenants/nonexistent/suspend')
        .set(authHeader)
        .send({ reason: 'test' });

      expect(res.status).toBe(404);
    });

    it('should return 400 when trying to suspend deleted tenant', async () => {
      mockServiceInstance.suspendTenant.mockRejectedValue(new Error('Cannot suspend a deleted tenant'));

      const res = await request(app)
        .post('/api/v1/platform/tenants/t1/suspend')
        .set(authHeader)
        .send({ reason: 'test' });

      expect(res.status).toBe(400);
    });
  });

  // ── DELETE /tenants/:id ───────────────────────────────────

  describe('DELETE /api/v1/platform/tenants/:id', () => {
    it('should delete a tenant', async () => {
      mockServiceInstance.deleteTenant.mockResolvedValue(true);

      const res = await request(app)
        .delete('/api/v1/platform/tenants/t1')
        .set(authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 404 when tenant not found', async () => {
      mockServiceInstance.deleteTenant.mockResolvedValue(false);

      const res = await request(app)
        .delete('/api/v1/platform/tenants/nonexistent')
        .set(authHeader);

      expect(res.status).toBe(404);
    });
  });

  // ── GET /dashboard ────────────────────────────────────────

  describe('GET /api/v1/platform/dashboard', () => {
    it('should return tenant dashboard', async () => {
      mockServiceInstance.getTenantDashboard.mockResolvedValue([
        { id: 't1', name: 'Org A', status: TenantStatus.ACTIVE, user_count: 25 },
      ]);

      const res = await request(app)
        .get('/api/v1/platform/dashboard')
        .set(authHeader);

      expect(res.status).toBe(200);
      expect(res.body.tenants).toHaveLength(1);
      expect(res.body.tenants[0].name).toBe('Org A');
    });
  });

  // ── GET /ai-config ────────────────────────────────────────

  describe('GET /api/v1/platform/ai-config', () => {
    it('should return global AI config', async () => {
      mockServiceInstance.getGlobalAIConfig.mockResolvedValue({
        default_model: 'gpt-4', default_provider: 'openai',
        safety_policies: { block_chemical_dosage: true },
        rate_limits: { max_queries_per_user_per_day: 100 },
      });

      const res = await request(app)
        .get('/api/v1/platform/ai-config')
        .set(authHeader);

      expect(res.status).toBe(200);
      expect(res.body.default_model).toBe('gpt-4');
    });
  });

  // ── PUT /ai-config ────────────────────────────────────────

  describe('PUT /api/v1/platform/ai-config', () => {
    it('should update global AI config', async () => {
      mockServiceInstance.updateGlobalAIConfig.mockResolvedValue({
        default_model: 'gpt-4-turbo', default_provider: 'openai',
        safety_policies: { block_chemical_dosage: true },
        rate_limits: { max_queries_per_user_per_day: 100 },
      });

      const res = await request(app)
        .put('/api/v1/platform/ai-config')
        .set(authHeader)
        .send({ default_model: 'gpt-4-turbo' });

      expect(res.status).toBe(200);
      expect(res.body.default_model).toBe('gpt-4-turbo');
    });
  });

  // ── GET /analytics ────────────────────────────────────────

  describe('GET /api/v1/platform/analytics', () => {
    it('should return cross-tenant analytics', async () => {
      mockServiceInstance.getCrossTenantAnalytics.mockResolvedValue({
        total_tenants: 5, active_tenants: 3, total_users: 150,
        active_users: 80, total_ai_interactions: 500, tenants_by_type: { fpo: 3 },
      });

      const res = await request(app)
        .get('/api/v1/platform/analytics')
        .set(authHeader);

      expect(res.status).toBe(200);
      expect(res.body.total_tenants).toBe(5);
      expect(res.body.active_users).toBe(80);
    });
  });

  // ── POST /tenants/:id/export ──────────────────────────────

  describe('POST /api/v1/platform/tenants/:id/export', () => {
    it('should create a data export request', async () => {
      mockServiceInstance.requestDataExport.mockResolvedValue({
        id: 'export-1', tenant_id: 't1', status: 'pending', requested_at: new Date(),
      });

      const res = await request(app)
        .post('/api/v1/platform/tenants/t1/export')
        .set(authHeader);

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('pending');
    });

    it('should return 404 when tenant not found', async () => {
      mockServiceInstance.requestDataExport.mockRejectedValue(new Error('Tenant not found'));

      const res = await request(app)
        .post('/api/v1/platform/tenants/nonexistent/export')
        .set(authHeader);

      expect(res.status).toBe(404);
    });
  });

  // ── GET /tenants/:id/feature-flags ────────────────────────

  describe('GET /api/v1/platform/tenants/:id/feature-flags', () => {
    it('should return feature flags', async () => {
      mockServiceInstance.getFeatureFlags.mockResolvedValue({ ai_chat: true, voice: false });

      const res = await request(app)
        .get('/api/v1/platform/tenants/t1/feature-flags')
        .set(authHeader);

      expect(res.status).toBe(200);
      expect(res.body.ai_chat).toBe(true);
    });

    it('should return 404 when tenant not found', async () => {
      mockServiceInstance.getFeatureFlags.mockRejectedValue(new Error('Tenant not found'));

      const res = await request(app)
        .get('/api/v1/platform/tenants/nonexistent/feature-flags')
        .set(authHeader);

      expect(res.status).toBe(404);
    });
  });

  // ── PUT /tenants/:id/feature-flags ────────────────────────

  describe('PUT /api/v1/platform/tenants/:id/feature-flags', () => {
    it('should update feature flags', async () => {
      mockServiceInstance.updateFeatureFlags.mockResolvedValue({ ai_chat: true, voice: true });

      const res = await request(app)
        .put('/api/v1/platform/tenants/t1/feature-flags')
        .set(authHeader)
        .send({ voice: true });

      expect(res.status).toBe(200);
      expect(res.body.voice).toBe(true);
    });

    it('should return 404 when tenant not found', async () => {
      mockServiceInstance.updateFeatureFlags.mockRejectedValue(new Error('Tenant not found'));

      const res = await request(app)
        .put('/api/v1/platform/tenants/nonexistent/feature-flags')
        .set(authHeader)
        .send({ ai_chat: true });

      expect(res.status).toBe(404);
    });
  });

  // ── POST /maintenance ─────────────────────────────────────

  describe('POST /api/v1/platform/maintenance', () => {
    it('should schedule maintenance', async () => {
      const futureStart = new Date(Date.now() + 48 * 60 * 60 * 1000);
      const futureEnd = new Date(futureStart.getTime() + 2 * 60 * 60 * 1000);

      mockServiceInstance.scheduleMaintenance.mockResolvedValue({
        id: 'mw-1', title: 'DB Upgrade', description: 'Upgrading',
        scheduled_start: futureStart, scheduled_end: futureEnd,
        notification_sent: false, created_at: new Date(),
      });

      const res = await request(app)
        .post('/api/v1/platform/maintenance')
        .set(authHeader)
        .send({
          title: 'DB Upgrade', description: 'Upgrading',
          scheduled_start: futureStart.toISOString(),
          scheduled_end: futureEnd.toISOString(),
        });

      expect(res.status).toBe(201);
      expect(res.body.title).toBe('DB Upgrade');
    });

    it('should reject missing required fields', async () => {
      const res = await request(app)
        .post('/api/v1/platform/maintenance')
        .set(authHeader)
        .send({ title: 'Upgrade' });

      expect(res.status).toBe(400);
    });

    it('should return 400 when scheduled less than 24 hours in advance', async () => {
      mockServiceInstance.scheduleMaintenance.mockRejectedValue(
        new Error('Maintenance must be scheduled at least 24 hours in advance'),
      );

      const res = await request(app)
        .post('/api/v1/platform/maintenance')
        .set(authHeader)
        .send({
          title: 'Fix', description: 'Emergency',
          scheduled_start: new Date().toISOString(),
          scheduled_end: new Date().toISOString(),
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('24 hours');
    });
  });

  // ── GET /maintenance ──────────────────────────────────────

  describe('GET /api/v1/platform/maintenance', () => {
    it('should return maintenance windows', async () => {
      mockServiceInstance.getMaintenanceWindows.mockResolvedValue([
        { id: 'mw-1', title: 'Upgrade', notification_sent: false },
      ]);

      const res = await request(app)
        .get('/api/v1/platform/maintenance')
        .set(authHeader);

      expect(res.status).toBe(200);
      expect(res.body.maintenance_windows).toHaveLength(1);
    });
  });
});
