import request from 'supertest';
import jwt from 'jsonwebtoken';

const mockQuery = jest.fn();
// Force mock provider (avoids AWS Transcribe dynamic-import error in Jest/CJS)
jest.mock('../services/ai/AwsCloudSpeechProvider', () => ({
  isSpeechConfigured: () => false,
  AwsCloudSpeechProvider: jest.fn(),
}));
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
      userId: 'farmer-speech-1',
      tenantId: 'tenant-1',
      roles: ['farmer'],
      sessionId: 'sess-speech-1',
      ...overrides,
    },
    JWT_SECRET,
    { expiresIn: '1h' },
  );
}

describe('Speech Routes', () => {
  const farmerToken = makeToken();

  // ── POST /api/v1/ai/speech-to-text ──────────────────────────

  describe('POST /api/v1/ai/speech-to-text', () => {
    it('should reject requests without auth', async () => {
      const res = await request(app)
        .post('/api/v1/ai/speech-to-text')
        .send({ audio: Buffer.alloc(5000).toString('base64') });

      expect(res.status).toBe(401);
    });

    it('should reject unsupported language', async () => {
      const res = await request(app)
        .post('/api/v1/ai/speech-to-text')
        .set('Authorization', `Bearer ${farmerToken}`)
        .set('X-Language', 'fr')
        .send({ audio: Buffer.alloc(5000).toString('base64') });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Unsupported language');
    });

    it('should reject empty audio', async () => {
      const res = await request(app)
        .post('/api/v1/ai/speech-to-text')
        .set('Authorization', `Bearer ${farmerToken}`)
        .set('X-Language', 'en')
        .send({ audio: '' });

      expect(res.status).toBe(400);
    });

    it('should convert speech to text with base64 audio', async () => {
      const token = makeToken({ userId: 'farmer-stt-1' });
      const audio = Buffer.alloc(100_000, 0xab).toString('base64');
      const res = await request(app)
        .post('/api/v1/ai/speech-to-text')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Language', 'en')
        .send({ audio });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('text');
      expect(res.body).toHaveProperty('confidence');
      expect(res.body).toHaveProperty('language', 'en');
      expect(res.body).toHaveProperty('noiseDetected');
      expect(typeof res.body.fallbackToText).toBe('boolean');
    });

    it('should support Hindi language', async () => {
      const token = makeToken({ userId: 'farmer-stt-2' });
      const audio = Buffer.alloc(100_000, 0xab).toString('base64');
      const res = await request(app)
        .post('/api/v1/ai/speech-to-text')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Language', 'hi')
        .send({ audio });

      expect(res.status).toBe(200);
      expect(res.body.language).toBe('hi');
    });

    it('should default to English when no language header', async () => {
      const token = makeToken({ userId: 'farmer-stt-3' });
      const audio = Buffer.alloc(100_000, 0xab).toString('base64');
      const res = await request(app)
        .post('/api/v1/ai/speech-to-text')
        .set('Authorization', `Bearer ${token}`)
        .send({ audio });

      expect(res.status).toBe(200);
      expect(res.body.language).toBe('en');
    });

    it('should reject unauthorized roles', async () => {
      const buyerToken = makeToken({ roles: ['buyer'] });
      const audio = Buffer.alloc(5000, 0xab).toString('base64');
      const res = await request(app)
        .post('/api/v1/ai/speech-to-text')
        .set('Authorization', `Bearer ${buyerToken}`)
        .set('X-Language', 'en')
        .send({ audio });

      expect(res.status).toBe(403);
    });

    it('should reject missing audio data', async () => {
      const res = await request(app)
        .post('/api/v1/ai/speech-to-text')
        .set('Authorization', `Bearer ${farmerToken}`)
        .set('X-Language', 'en')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Audio data is required');
    });
  });

  // ── POST /api/v1/ai/text-to-speech ──────────────────────────

  describe('POST /api/v1/ai/text-to-speech', () => {
    it('should reject requests without auth', async () => {
      const res = await request(app)
        .post('/api/v1/ai/text-to-speech')
        .send({ text: 'Hello', language: 'en' });

      expect(res.status).toBe(401);
    });

    it('should convert text to speech', async () => {
      const res = await request(app)
        .post('/api/v1/ai/text-to-speech')
        .set('Authorization', `Bearer ${farmerToken}`)
        .send({ text: 'Hello farmer, your crops are doing well.', language: 'en' });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('audio');
      expect(res.headers['x-audio-duration-ms']).toBeDefined();
      expect(res.headers['x-audio-language']).toBe('en');
    });

    it('should reject empty text', async () => {
      const res = await request(app)
        .post('/api/v1/ai/text-to-speech')
        .set('Authorization', `Bearer ${farmerToken}`)
        .send({ text: '', language: 'en' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('text is required');
    });

    it('should reject unsupported language', async () => {
      const res = await request(app)
        .post('/api/v1/ai/text-to-speech')
        .set('Authorization', `Bearer ${farmerToken}`)
        .send({ text: 'Hello', language: 'fr' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Unsupported language');
    });

    it('should default to English', async () => {
      const res = await request(app)
        .post('/api/v1/ai/text-to-speech')
        .set('Authorization', `Bearer ${farmerToken}`)
        .send({ text: 'Hello' });

      expect(res.status).toBe(200);
      expect(res.headers['x-audio-language']).toBe('en');
    });

    it('should reject unauthorized roles', async () => {
      const buyerToken = makeToken({ roles: ['buyer'] });
      const res = await request(app)
        .post('/api/v1/ai/text-to-speech')
        .set('Authorization', `Bearer ${buyerToken}`)
        .send({ text: 'Hello', language: 'en' });

      expect(res.status).toBe(403);
    });
  });

  // ── POST /api/v1/ai/speech-reset ────────────────────────────

  describe('POST /api/v1/ai/speech-reset', () => {
    it('should reset speech tracker', async () => {
      const res = await request(app)
        .post('/api/v1/ai/speech-reset')
        .set('Authorization', `Bearer ${farmerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('reset');
    });

    it('should reject without auth', async () => {
      const res = await request(app).post('/api/v1/ai/speech-reset');
      expect(res.status).toBe(401);
    });
  });
});
