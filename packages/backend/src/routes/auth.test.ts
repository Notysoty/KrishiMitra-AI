import request from 'supertest';
import app from '../index';
import { _clearStores, _getOtpStore } from '../services/auth';

// ── Mock pg Pool ───────────────────────────────────────────────
const mockQuery = jest.fn();
jest.mock('../db/pool', () => ({
  initPool: jest.fn().mockResolvedValue(undefined),
  getPool: () => ({ query: mockQuery, connect: jest.fn() }),
}));

describe('Auth Routes', () => {
  beforeEach(() => {
    _clearStores();
    mockQuery.mockReset();
  });

  describe('POST /api/v1/auth/register', () => {
    it('should register a user and return 201', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // no existing user check
        .mockResolvedValueOnce({ rows: [{ id: 'tenant-1' }] }) // tenant exists
        .mockResolvedValueOnce({ rows: [] }) // insert user
        .mockResolvedValueOnce({ rows: [{ id: 'user-1', tenant_id: 'tenant-1' }] }); // login SELECT

      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ phone: '+919876543210', name: 'Farmer', tenant_id: 'tenant-1' });

      expect(res.status).toBe(201);
      expect(res.body.message).toContain('Account created');
    });

    it('should return 400 for missing fields', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ phone: '9876543210' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('required');
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('should return OTP for valid user', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'user-1', tenant_id: 'tenant-1' }],
      });

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ phone: '+919876543210', tenant_id: 'tenant-1' });

      expect(res.status).toBe(200);
      expect(res.body.otp).toMatch(/^\d{6}$/);
    });

    it('should return 400 for missing fields', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({});

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/v1/auth/verify-otp', () => {
    it('should return tokens for valid OTP', async () => {
      _getOtpStore().set('tenant-1:+919876543210', {
        otp: '123456',
        expiresAt: Date.now() + 300000,
        userId: 'user-1',
        tenantId: 'tenant-1',
      });

      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'user-1', tenant_id: 'tenant-1', phone: '+919876543210', name: 'Farmer', roles: ['farmer'] }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .post('/api/v1/auth/verify-otp')
        .send({ phone: '+919876543210', tenant_id: 'tenant-1', otp: '123456' });

      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
      expect(res.body.expiresIn).toBe(86400);
    });

    it('should return 401 for invalid OTP', async () => {
      _getOtpStore().set('tenant-1:+919876543210', {
        otp: '123456',
        expiresAt: Date.now() + 300000,
        userId: 'user-1',
        tenantId: 'tenant-1',
      });

      const res = await request(app)
        .post('/api/v1/auth/verify-otp')
        .send({ phone: '+919876543210', tenant_id: 'tenant-1', otp: '000000' });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('should return 401 without token', async () => {
      const res = await request(app).get('/api/v1/auth/me');
      expect(res.status).toBe(401);
    });

    it('should return user profile with valid token', async () => {
      // Get a token first
      _getOtpStore().set('tenant-1:+919876543210', {
        otp: '123456',
        expiresAt: Date.now() + 300000,
        userId: 'user-1',
        tenantId: 'tenant-1',
      });

      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'user-1', tenant_id: 'tenant-1', phone: '+919876543210', name: 'Farmer', roles: ['farmer'] }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const loginRes = await request(app)
        .post('/api/v1/auth/verify-otp')
        .send({ phone: '+919876543210', tenant_id: 'tenant-1', otp: '123456' });

      const token = loginRes.body.accessToken;

      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'user-1',
          tenant_id: 'tenant-1',
          phone: '9876543210',
          name: 'Farmer',
          roles: ['farmer'],
          language_preference: 'en',
          created_at: new Date().toISOString(),
          last_login: new Date().toISOString(),
        }],
      });

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('user-1');
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('should invalidate all sessions', async () => {
      // Get a token
      _getOtpStore().set('tenant-1:+919876543210', {
        otp: '123456',
        expiresAt: Date.now() + 300000,
        userId: 'user-1',
        tenantId: 'tenant-1',
      });

      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'user-1', tenant_id: 'tenant-1', phone: '+919876543210', name: 'Farmer', roles: ['farmer'] }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const loginRes = await request(app)
        .post('/api/v1/auth/verify-otp')
        .send({ phone: '+919876543210', tenant_id: 'tenant-1', otp: '123456' });

      mockQuery.mockResolvedValueOnce({ rows: [] }); // DELETE sessions

      const res = await request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${loginRes.body.accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('All sessions invalidated');
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    it('should return 400 without refreshToken', async () => {
      const res = await request(app)
        .post('/api/v1/auth/refresh')
        .send({});

      expect(res.status).toBe(400);
    });
  });
});
