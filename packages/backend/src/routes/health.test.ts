import express from 'express';
import request from 'supertest';
import healthRouter, { healthCheck } from './health';

function createApp() {
  const app = express();
  app.use('/api/v1/health', healthRouter);
  return app;
}

describe('GET /api/v1/health', () => {
  beforeEach(() => {
    // Clear all registered checks between tests
    for (const name of healthCheck.getRegisteredChecks()) {
      healthCheck.unregister(name);
    }
  });

  it('should return 200 with healthy status when all checks pass', async () => {
    healthCheck.register('db', async () => ({
      service: 'db',
      status: 'healthy',
      latencyMs: 5,
      checkedAt: new Date().toISOString(),
    }));

    const res = await request(createApp()).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
    expect(res.body.services).toHaveLength(1);
  });

  it('should return 200 with degraded status', async () => {
    healthCheck.register('ai', async () => ({
      service: 'ai',
      status: 'degraded',
      message: 'Slow responses',
      checkedAt: new Date().toISOString(),
    }));

    const res = await request(createApp()).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('degraded');
  });

  it('should return 503 when unhealthy', async () => {
    healthCheck.register('db', async () => ({
      service: 'db',
      status: 'unhealthy',
      message: 'Connection refused',
      checkedAt: new Date().toISOString(),
    }));

    const res = await request(createApp()).get('/api/v1/health');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('unhealthy');
  });

  it('should return 200 healthy with no registered checks', async () => {
    const res = await request(createApp()).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
    expect(res.body.services).toEqual([]);
  });
});
