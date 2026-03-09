import request from 'supertest';
import jwt from 'jsonwebtoken';
import { _setJwtSecret } from '../config/secrets';
import app from '../index';

// ── Mock pg Pool ───────────────────────────────────────────────
const mockQuery = jest.fn();
const mockRelease = jest.fn();
const mockClient = { query: mockQuery, release: mockRelease };

jest.mock('../db/pool', () => ({
  initPool: jest.fn().mockResolvedValue(undefined),
  getPool: () => ({
    query: mockQuery,
    connect: jest.fn().mockResolvedValue(mockClient),
  }),
}));

// ── Helper: generate a valid JWT ───────────────────────────────
const JWT_SECRET = 'krishimitra-test-secret';

beforeAll(() => { _setJwtSecret(JWT_SECRET); });

function makeToken(overrides = {}) {
  return jwt.sign(
    {
      userId: 'user-1',
      tenantId: 'tenant-1',
      roles: ['farmer'],
      sessionId: 'sess-1',
      ...overrides,
    },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('Farm Routes', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockRelease.mockReset();
  });

  // ── POST /api/v1/farms ─────────────────────────────────────

  describe('POST /api/v1/farms', () => {
    const validBody = {
      name: 'Green Acres',
      location: { latitude: 28.6, longitude: 77.2, state: 'Delhi' },
      total_acreage: 5,
      irrigation_type: 'drip',
    };

    it('should return 401 without token', async () => {
      const res = await request(app).post('/api/v1/farms').send(validBody);
      expect(res.status).toBe(401);
    });

    it('should return 403 for unauthorized role', async () => {
      const token = makeToken({ roles: ['buyer'] });
      const res = await request(app)
        .post('/api/v1/farms')
        .set('Authorization', `Bearer ${token}`)
        .send(validBody);
      expect(res.status).toBe(403);
    });

    it('should create a farm and return 201', async () => {
      const token = makeToken();
      // BEGIN, SET LOCAL, INSERT, COMMIT
      mockQuery
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({
          rows: [{
            id: 'farm-1',
            tenant_id: 'tenant-1',
            user_id: 'user-1',
            name: 'Green Acres',
            location: JSON.stringify({ latitude: 28.6, longitude: 77.2, state: 'Delhi' }),
            total_acreage: 5,
            irrigation_type: 'drip',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }],
        })
        .mockResolvedValueOnce(undefined);

      const res = await request(app)
        .post('/api/v1/farms')
        .set('Authorization', `Bearer ${token}`)
        .send(validBody);

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Green Acres');
      expect(res.body.id).toBe('farm-1');
    });

    it('should return 400 for missing fields with missingFields detail', async () => {
      const token = makeToken();
      const res = await request(app)
        .post('/api/v1/farms')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.missingFields).toBeDefined();
      expect(res.body.missingFields.length).toBeGreaterThan(0);
    });

    it('should return 400 for location outside India', async () => {
      const token = makeToken();
      const res = await request(app)
        .post('/api/v1/farms')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...validBody, location: { latitude: 51.5, longitude: -0.12 } });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('India');
    });
  });

  // ── GET /api/v1/farms/:id ──────────────────────────────────

  describe('GET /api/v1/farms/:id', () => {
    it('should return farm with crops', async () => {
      const token = makeToken();
      // Farm query: BEGIN, SET LOCAL, SELECT, COMMIT
      mockQuery
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({
          rows: [{
            id: 'farm-1',
            tenant_id: 'tenant-1',
            user_id: 'user-1',
            name: 'Green Acres',
            location: { latitude: 28.6, longitude: 77.2 },
            total_acreage: 5,
            irrigation_type: 'drip',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }],
        })
        .mockResolvedValueOnce(undefined)
        // Crops query: BEGIN, SET LOCAL, SELECT, COMMIT
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({
          rows: [{ id: 'crop-1', farm_id: 'farm-1', crop_type: 'wheat', status: 'planted' }],
        })
        .mockResolvedValueOnce(undefined);

      const res = await request(app)
        .get('/api/v1/farms/farm-1')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Green Acres');
      expect(res.body.crops).toHaveLength(1);
    });

    it('should return 404 for non-existent farm', async () => {
      const token = makeToken();
      mockQuery
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce(undefined);

      const res = await request(app)
        .get('/api/v1/farms/nonexistent')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });
  });

  // ── PUT /api/v1/farms/:id ──────────────────────────────────

  describe('PUT /api/v1/farms/:id', () => {
    it('should update farm and return 200', async () => {
      const token = makeToken();
      // findById: BEGIN, SET LOCAL, SELECT, COMMIT
      mockQuery
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ rows: [{ id: 'farm-1', tenant_id: 'tenant-1' }] })
        .mockResolvedValueOnce(undefined)
        // update: BEGIN, SET LOCAL, UPDATE, COMMIT
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({
          rows: [{
            id: 'farm-1',
            tenant_id: 'tenant-1',
            name: 'Updated',
            location: { latitude: 28.6, longitude: 77.2 },
            total_acreage: 10,
            irrigation_type: 'drip',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }],
        })
        .mockResolvedValueOnce(undefined);

      const res = await request(app)
        .put('/api/v1/farms/farm-1')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Updated', total_acreage: 10 });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Updated');
    });
  });

  // ── DELETE /api/v1/farms/:id ───────────────────────────────

  describe('DELETE /api/v1/farms/:id', () => {
    it('should delete farm and return anonymization message', async () => {
      const token = makeToken();
      // findById: BEGIN, SET LOCAL, SELECT, COMMIT
      mockQuery
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ rows: [{ id: 'farm-1' }] })
        .mockResolvedValueOnce(undefined)
        // transaction: BEGIN, SET LOCAL, UPDATE yield, UPDATE inputs, DELETE crops, DELETE farms, COMMIT
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined);

      const res = await request(app)
        .delete('/api/v1/farms/farm-1')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('deleted');
      expect(res.body.message).toContain('anonymized');
    });
  });
});
