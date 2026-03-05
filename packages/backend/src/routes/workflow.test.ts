import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../index';

const JWT_SECRET = 'krishimitra-dev-secret';

function makeToken(overrides: Record<string, unknown> = {}) {
  return jwt.sign(
    {
      userId: 'farmer-wf-1',
      tenantId: 'tenant-1',
      roles: ['farmer'],
      sessionId: 'sess-wf-1',
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

describe('Workflow Routes', () => {
  const farmerToken = makeToken();

  // ── POST /api/v1/ai/workflow/:type ────────────────────────────

  describe('POST /api/v1/ai/workflow/:type', () => {
    it('should reject requests without auth', async () => {
      const res = await request(app)
        .post('/api/v1/ai/workflow/plan_season')
        .send(FARM_BODY);

      expect(res.status).toBe(401);
    });

    it('should reject unauthorized roles', async () => {
      const buyerToken = makeToken({ roles: ['buyer'] });
      const res = await request(app)
        .post('/api/v1/ai/workflow/plan_season')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send(FARM_BODY);

      expect(res.status).toBe(403);
    });

    it('should reject invalid workflow type', async () => {
      const res = await request(app)
        .post('/api/v1/ai/workflow/invalid_type')
        .set('Authorization', `Bearer ${farmerToken}`)
        .send(FARM_BODY);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid workflow type');
      expect(res.body.error).toContain('plan_season');
      expect(res.body.error).toContain('check_eligibility');
    });

    it('should execute plan_season workflow with farm data', async () => {
      const res = await request(app)
        .post('/api/v1/ai/workflow/plan_season')
        .set('Authorization', `Bearer ${farmerToken}`)
        .send(FARM_BODY);

      expect(res.status).toBe(200);
      expect(res.body.workflowType).toBe('plan_season');
      expect(res.body.id).toBeDefined();
      expect(res.body.title).toBe('Season Planning');
      expect(res.body.steps).toBeInstanceOf(Array);
      expect(res.body.steps.length).toBe(5);
      expect(res.body.citations).toBeInstanceOf(Array);
      expect(res.body.citations.length).toBeGreaterThan(0);
      expect(res.body.summary).toBeDefined();
    });

    it('should execute plan_season without farm data and indicate missing data', async () => {
      const res = await request(app)
        .post('/api/v1/ai/workflow/plan_season')
        .set('Authorization', `Bearer ${farmerToken}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.workflowType).toBe('plan_season');
      const missingSteps = res.body.steps.filter(
        (s: any) => s.status === 'missing_data',
      );
      expect(missingSteps.length).toBeGreaterThan(0);
    });

    it('should execute check_eligibility workflow', async () => {
      const res = await request(app)
        .post('/api/v1/ai/workflow/check_eligibility')
        .set('Authorization', `Bearer ${farmerToken}`)
        .send(FARM_BODY);

      expect(res.status).toBe(200);
      expect(res.body.workflowType).toBe('check_eligibility');
      expect(res.body.title).toBe('Government Scheme Eligibility');
      expect(res.body.steps.length).toBeGreaterThan(1);
      expect(res.body.citations.length).toBeGreaterThan(0);
    });

    it('should include step numbers in order', async () => {
      const res = await request(app)
        .post('/api/v1/ai/workflow/plan_season')
        .set('Authorization', `Bearer ${farmerToken}`)
        .send(FARM_BODY);

      expect(res.status).toBe(200);
      const stepNumbers = res.body.steps.map((s: any) => s.step);
      expect(stepNumbers).toEqual([1, 2, 3, 4, 5]);
    });

    it('should include citations with source info', async () => {
      const res = await request(app)
        .post('/api/v1/ai/workflow/plan_season')
        .set('Authorization', `Bearer ${farmerToken}`)
        .send(FARM_BODY);

      expect(res.status).toBe(200);
      res.body.citations.forEach((c: any) => {
        expect(c.text).toBeDefined();
        expect(c.source).toBeDefined();
      });
    });
  });

  // ── GET /api/v1/ai/workflow/results ───────────────────────────

  describe('GET /api/v1/ai/workflow/results', () => {
    it('should reject requests without auth', async () => {
      const res = await request(app).get('/api/v1/ai/workflow/results');
      expect(res.status).toBe(401);
    });

    it('should return saved workflow results', async () => {
      const token = makeToken({ userId: 'farmer-results-1' });

      // Execute a workflow first
      await request(app)
        .post('/api/v1/ai/workflow/plan_season')
        .set('Authorization', `Bearer ${token}`)
        .send(FARM_BODY);

      const res = await request(app)
        .get('/api/v1/ai/workflow/results')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.results).toBeInstanceOf(Array);
      expect(res.body.count).toBeGreaterThanOrEqual(1);
    });
  });
});
