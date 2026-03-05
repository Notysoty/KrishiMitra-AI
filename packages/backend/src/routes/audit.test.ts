import request from 'supertest';
import express from 'express';

// ── Mocks ──────────────────────────────────────────────────────

const mockServiceInstance = {
  search: jest.fn(),
  exportCsv: jest.fn(),
  getSuspiciousActivity: jest.fn(),
  getRetentionYears: jest.fn().mockReturnValue(3),
  getRetentionCutoffDate: jest.fn().mockReturnValue(new Date('2021-06-15T00:00:00Z')),
};

jest.mock('../services/admin/AuditService', () => ({
  AuditService: jest.fn().mockImplementation(() => mockServiceInstance),
}));

jest.mock('../services/auth', () => ({
  verifyToken: () => ({
    userId: 'admin-1',
    tenantId: 'tenant-1',
    roles: ['tenant_admin'],
    sessionId: 'session-1',
  }),
}));

import auditRoutes from './audit';

const app = express();
app.use(express.json());
app.use('/api/v1/audit', auditRoutes);

describe('Audit Routes', () => {
  const authHeader = { Authorization: 'Bearer valid-token' };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── GET /logs ─────────────────────────────────────────────

  describe('GET /api/v1/audit/logs', () => {
    it('should return audit logs', async () => {
      mockServiceInstance.search.mockResolvedValue({ logs: [], total: 0 });

      const res = await request(app)
        .get('/api/v1/audit/logs')
        .set(authHeader);

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(0);
      expect(res.body.logs).toEqual([]);
    });

    it('should pass filter parameters', async () => {
      mockServiceInstance.search.mockResolvedValue({ logs: [], total: 0 });

      const res = await request(app)
        .get('/api/v1/audit/logs?action=add_user&userId=user-1&resourceType=user&sensitive=true')
        .set(authHeader);

      expect(res.status).toBe(200);
      expect(mockServiceInstance.search).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: 'tenant-1',
          action: 'add_user',
          user_id: 'user-1',
          resource_type: 'user',
          is_sensitive: true,
        }),
      );
    });

    it('should pass date range filters', async () => {
      mockServiceInstance.search.mockResolvedValue({ logs: [], total: 0 });

      const res = await request(app)
        .get('/api/v1/audit/logs?startDate=2024-01-01&endDate=2024-12-31')
        .set(authHeader);

      expect(res.status).toBe(200);
      expect(mockServiceInstance.search).toHaveBeenCalledWith(
        expect.objectContaining({
          start_date: expect.any(Date),
          end_date: expect.any(Date),
        }),
      );
    });

    it('should require authentication', async () => {
      const res = await request(app).get('/api/v1/audit/logs');
      expect(res.status).toBe(401);
    });

    it('should handle service errors', async () => {
      mockServiceInstance.search.mockRejectedValue(new Error('DB error'));

      const res = await request(app)
        .get('/api/v1/audit/logs')
        .set(authHeader);

      expect(res.status).toBe(500);
    });
  });

  // ── GET /logs/export ──────────────────────────────────────

  describe('GET /api/v1/audit/logs/export', () => {
    it('should return CSV content', async () => {
      mockServiceInstance.exportCsv.mockResolvedValue('id,action\nlog-1,add_user');

      const res = await request(app)
        .get('/api/v1/audit/logs/export')
        .set(authHeader);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('audit_logs.csv');
      expect(res.text).toContain('id,action');
    });

    it('should pass filter parameters for export', async () => {
      mockServiceInstance.exportCsv.mockResolvedValue('header\n');

      await request(app)
        .get('/api/v1/audit/logs/export?action=add_user')
        .set(authHeader);

      expect(mockServiceInstance.exportCsv).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'add_user' }),
      );
    });

    it('should require authentication', async () => {
      const res = await request(app).get('/api/v1/audit/logs/export');
      expect(res.status).toBe(401);
    });
  });

  // ── GET /suspicious ───────────────────────────────────────

  describe('GET /api/v1/audit/suspicious', () => {
    it('should return suspicious activity entries', async () => {
      mockServiceInstance.getSuspiciousActivity.mockResolvedValue({
        logs: [{ id: 'log-1', is_suspicious: true, suspicious_reason: 'Multiple failed logins' }],
        total: 1,
      });

      const res = await request(app)
        .get('/api/v1/audit/suspicious')
        .set(authHeader);

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.logs[0].is_suspicious).toBe(true);
    });

    it('should pass pagination parameters', async () => {
      mockServiceInstance.getSuspiciousActivity.mockResolvedValue({ logs: [], total: 0 });

      await request(app)
        .get('/api/v1/audit/suspicious?limit=10&offset=5')
        .set(authHeader);

      expect(mockServiceInstance.getSuspiciousActivity).toHaveBeenCalledWith(
        expect.objectContaining({ tenant_id: 'tenant-1', limit: 10, offset: 5 }),
      );
    });

    it('should require authentication', async () => {
      const res = await request(app).get('/api/v1/audit/suspicious');
      expect(res.status).toBe(401);
    });
  });

  // ── GET /retention ────────────────────────────────────────

  describe('GET /api/v1/audit/retention', () => {
    it('should return retention policy info', async () => {
      const res = await request(app)
        .get('/api/v1/audit/retention')
        .set(authHeader);

      expect(res.status).toBe(200);
      expect(res.body.retention_years).toBe(3);
      expect(res.body.cutoff_date).toBeDefined();
    });

    it('should require authentication', async () => {
      const res = await request(app).get('/api/v1/audit/retention');
      expect(res.status).toBe(401);
    });
  });
});
