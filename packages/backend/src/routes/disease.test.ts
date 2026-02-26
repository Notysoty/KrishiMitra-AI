import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../index';

const JWT_SECRET = 'krishimitra-dev-secret';

function makeToken(overrides: Record<string, unknown> = {}) {
  return jwt.sign(
    {
      userId: 'farmer-1',
      tenantId: 'tenant-1',
      roles: ['farmer'],
      sessionId: 'sess-disease-1',
      ...overrides,
    },
    JWT_SECRET,
    { expiresIn: '1h' },
  );
}

describe('Disease Routes', () => {
  const farmerToken = makeToken();

  // ── POST /api/v1/disease/classify ────────────────────────────
  describe('POST /api/v1/disease/classify', () => {
    it('should reject requests without auth', async () => {
      const res = await request(app)
        .post('/api/v1/disease/classify')
        .set('Content-Type', 'image/jpeg')
        .send(Buffer.alloc(50_000, 0xab));

      expect(res.status).toBe(401);
    });

    it('should reject unsupported image format', async () => {
      const res = await request(app)
        .post('/api/v1/disease/classify')
        .set('Authorization', `Bearer ${farmerToken}`)
        .set('Content-Type', 'image/gif')
        .set('X-Crop-Type', 'rice')
        .send(Buffer.alloc(50_000, 0xab));

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Unsupported');
    });

    it('should reject poor quality (very small) images', async () => {
      const res = await request(app)
        .post('/api/v1/disease/classify')
        .set('Authorization', `Bearer ${farmerToken}`)
        .set('Content-Type', 'image/jpeg')
        .set('X-Crop-Type', 'rice')
        .send(Buffer.alloc(5_000, 0x01));

      expect(res.status).toBe(422);
      expect(res.body.error).toContain('retake');
    });

    it('should classify a valid image and return result', async () => {
      const res = await request(app)
        .post('/api/v1/disease/classify')
        .set('Authorization', `Bearer ${farmerToken}`)
        .set('Content-Type', 'image/png')
        .set('X-Crop-Type', 'rice')
        .send(Buffer.alloc(100_000, 0xfe));

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('confidence');
      expect(res.body).toHaveProperty('disease');
      expect(res.body).toHaveProperty('disclaimer');
      expect(res.body.confidence).toBeGreaterThanOrEqual(0);
      expect(res.body.confidence).toBeLessThanOrEqual(1);
    });

    it('should reject unauthorized roles', async () => {
      const buyerToken = makeToken({ roles: ['buyer'] });
      const res = await request(app)
        .post('/api/v1/disease/classify')
        .set('Authorization', `Bearer ${buyerToken}`)
        .set('Content-Type', 'image/jpeg')
        .set('X-Crop-Type', 'rice')
        .send(Buffer.alloc(50_000, 0xab));

      expect(res.status).toBe(403);
    });
  });

  // ── GET /api/v1/disease/history ──────────────────────────────
  describe('GET /api/v1/disease/history', () => {
    it('should reject requests without auth', async () => {
      const res = await request(app).get('/api/v1/disease/history');
      expect(res.status).toBe(401);
    });

    it('should return classification history', async () => {
      const res = await request(app)
        .get('/api/v1/disease/history')
        .set('Authorization', `Bearer ${farmerToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('history');
      expect(res.body).toHaveProperty('count');
      expect(Array.isArray(res.body.history)).toBe(true);
    });
  });
});
