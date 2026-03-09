import request from 'supertest';
import jwt from 'jsonwebtoken';

const mockQuery = jest.fn();
jest.mock('../db/pool', () => ({
  initPool: jest.fn().mockResolvedValue(undefined),
  getPool: () => ({ query: mockQuery, connect: jest.fn() }),
}));

import app from '../index';
import { _setJwtSecret } from '../config/secrets';

const JWT_SECRET = 'krishimitra-test-secret';
beforeAll(() => { _setJwtSecret(JWT_SECRET); });

function makeToken(overrides: any = {}) {
  return jwt.sign(
    {
      userId: 'farmer-scheme-1',
      tenantId: 'tenant-1',
      roles: ['farmer'],
      sessionId: 'sess-scheme-1',
      ...overrides,
    },
    JWT_SECRET,
    { expiresIn: '1h' },
  );
}

const FARM_BODY = {
  farm: {
    farmId: 'farm-1',
    crops: [
      {
        crop_type: 'rice',
        variety: 'Basmati',
        acreage: 2,
        planting_date: '2024-06-15',
        expected_harvest_date: '2024-10-20',
        status: 'planted',
      },
    ],
    location: { latitude: 20.5, longitude: 78.9, state: 'Maharashtra' },
    total_acreage: 3,
    irrigation_type: 'drip',
  },
};

describe('Scheme Routes', () => {
  const farmerToken = makeToken();

  // ── POST /api/v1/schemes/check-eligibility ────────────────────

  describe('POST /api/v1/schemes/check-eligibility', () => {
    it('should reject requests without auth', async () => {
      const res = await request(app)
        .post('/api/v1/schemes/check-eligibility')
        .send(FARM_BODY);
      expect(res.status).toBe(401);
    });

    it('should reject unauthorized roles', async () => {
      const buyerToken = makeToken({ roles: ['buyer'] });
      const res = await request(app)
        .post('/api/v1/schemes/check-eligibility')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send(FARM_BODY);
      expect(res.status).toBe(403);
    });

    it('should evaluate schemes with farm data', async () => {
      const res = await request(app)
        .post('/api/v1/schemes/check-eligibility')
        .set('Authorization', `Bearer ${farmerToken}`)
        .send(FARM_BODY);

      expect(res.status).toBe(200);
      expect(res.body.schemes).toBeInstanceOf(Array);
      expect(res.body.schemes.length).toBe(4);
      expect(res.body.summary).toBeDefined();
      expect(res.body.checkedAt).toBeDefined();
    });

    it('should return eligibility statuses', async () => {
      const res = await request(app)
        .post('/api/v1/schemes/check-eligibility')
        .set('Authorization', `Bearer ${farmerToken}`)
        .send(FARM_BODY);

      expect(res.status).toBe(200);
      res.body.schemes.forEach((s: any) => {
        expect(['Eligible', 'Not Eligible', 'Insufficient Data']).toContain(
          s.eligibilityStatus,
        );
      });
    });

    it('should include citations for each scheme', async () => {
      const res = await request(app)
        .post('/api/v1/schemes/check-eligibility')
        .set('Authorization', `Bearer ${farmerToken}`)
        .send(FARM_BODY);

      expect(res.status).toBe(200);
      res.body.schemes.forEach((s: any) => {
        expect(s.citations.length).toBeGreaterThan(0);
        s.citations.forEach((c: any) => {
          expect(c.url).toBeDefined();
          expect(c.source).toBeDefined();
        });
      });
    });

    it('should include data source label', async () => {
      const res = await request(app)
        .post('/api/v1/schemes/check-eligibility')
        .set('Authorization', `Bearer ${farmerToken}`)
        .send(FARM_BODY);

      expect(res.status).toBe(200);
      res.body.schemes.forEach((s: any) => {
        expect(['Public_Dataset', 'Synthetic_Dataset']).toContain(s.dataSource);
      });
    });

    it('should handle missing farm data gracefully', async () => {
      const res = await request(app)
        .post('/api/v1/schemes/check-eligibility')
        .set('Authorization', `Bearer ${farmerToken}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.summary).toContain('Unable to evaluate');
      res.body.schemes.forEach((s: any) => {
        expect(s.eligibilityStatus).toBe('Insufficient Data');
      });
    });

    it('should include application steps for eligible schemes', async () => {
      const res = await request(app)
        .post('/api/v1/schemes/check-eligibility')
        .set('Authorization', `Bearer ${farmerToken}`)
        .send(FARM_BODY);

      expect(res.status).toBe(200);
      const eligible = res.body.schemes.filter(
        (s: any) => s.eligibilityStatus === 'Eligible',
      );
      eligible.forEach((s: any) => {
        expect(s.applicationSteps).toBeDefined();
        expect(s.applicationSteps.length).toBeGreaterThan(0);
      });
    });

    it('should include lastUpdated for each scheme', async () => {
      const res = await request(app)
        .post('/api/v1/schemes/check-eligibility')
        .set('Authorization', `Bearer ${farmerToken}`)
        .send(FARM_BODY);

      expect(res.status).toBe(200);
      res.body.schemes.forEach((s: any) => {
        expect(s.lastUpdated).toBeDefined();
      });
    });
  });

  // ── GET /api/v1/schemes ───────────────────────────────────────

  describe('GET /api/v1/schemes', () => {
    it('should reject requests without auth', async () => {
      const res = await request(app).get('/api/v1/schemes');
      expect(res.status).toBe(401);
    });

    it('should return all schemes', async () => {
      const res = await request(app)
        .get('/api/v1/schemes')
        .set('Authorization', `Bearer ${farmerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.schemes).toBeInstanceOf(Array);
      expect(res.body.schemes.length).toBe(4);
    });
  });
});
