/**
 * Tests for rate limiting middleware.
 * Requirements: 33.8
 */

import { Request, Response, NextFunction } from 'express';
import {
  USER_AI_DAILY_LIMIT,
  WINDOW_SECONDS_DAY,
  userAiRateLimitKey,
  tenantRateLimitKey,
  incrementCounter,
  getCounter,
  userAiRateLimit,
  tenantRateLimit,
  getTenantDailyLimit,
} from './rateLimiter';
import { setRedisClient, RedisClient } from './cache';
import { AuthenticatedRequest } from './authenticate';

// ── Mock Redis ────────────────────────────────────────────────

function makeMockRedis(store: Map<string, string> = new Map()): RedisClient {
  return {
    get: jest.fn(async (key: string) => store.get(key) ?? null),
    set: jest.fn(async (key: string, value: string) => {
      store.set(key, value);
      return 'OK';
    }),
    del: jest.fn(async (key: string) => {
      store.delete(key);
      return 1;
    }),
    quit: jest.fn(async () => 'OK'),
  };
}

// ── Request / Response helpers ────────────────────────────────

function makeAuthReq(userId = 'user-1', tenantId = 'tenant-1'): AuthenticatedRequest {
  return {
    method: 'POST',
    path: '/api/v1/ai/chat',
    headers: {},
    user: { id: userId, tenant_id: tenantId, roles: ['farmer'], sessionId: 'sess-1' },
  } as unknown as AuthenticatedRequest;
}

function makeRes(): Response {
  const res: Partial<Response> = {
    statusCode: 200,
    setHeader: jest.fn(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  return res as Response;
}

// ── Key helpers ───────────────────────────────────────────────

describe('key helpers', () => {
  it('userAiRateLimitKey includes userId and today date', () => {
    const key = userAiRateLimitKey('user-abc');
    const today = new Date().toISOString().slice(0, 10);
    expect(key).toBe(`rl:user:ai:user-abc:${today}`);
  });

  it('tenantRateLimitKey includes tenantId and window label', () => {
    const key = tenantRateLimitKey('tenant-xyz', '2024-01-15');
    expect(key).toBe('rl:tenant:tenant-xyz:2024-01-15');
  });
});

// ── incrementCounter ──────────────────────────────────────────

describe('incrementCounter', () => {
  let store: Map<string, string>;
  let mockRedis: RedisClient;

  beforeEach(() => {
    store = new Map();
    mockRedis = makeMockRedis(store);
    setRedisClient(mockRedis);
  });

  afterEach(() => {
    setRedisClient(null as unknown as RedisClient);
  });

  it('returns 1 on first increment', async () => {
    const count = await incrementCounter('test-key', 3600);
    expect(count).toBe(1);
  });

  it('increments on subsequent calls', async () => {
    await incrementCounter('test-key', 3600);
    const count = await incrementCounter('test-key', 3600);
    expect(count).toBe(2);
  });

  it('sets TTL on first increment', async () => {
    await incrementCounter('test-key', 3600);
    const setCalls = (mockRedis.set as jest.Mock).mock.calls;
    expect(setCalls[0][2]).toEqual({ EX: 3600 });
  });

  it('returns null when Redis is unavailable', async () => {
    setRedisClient(null as unknown as RedisClient);
    const count = await incrementCounter('test-key', 3600);
    expect(count).toBeNull();
  });

  it('returns null when Redis throws', async () => {
    (mockRedis.get as jest.Mock).mockRejectedValueOnce(new Error('Redis error'));
    const count = await incrementCounter('test-key', 3600);
    expect(count).toBeNull();
  });
});

// ── getCounter ────────────────────────────────────────────────

describe('getCounter', () => {
  let store: Map<string, string>;
  let mockRedis: RedisClient;

  beforeEach(() => {
    store = new Map();
    mockRedis = makeMockRedis(store);
    setRedisClient(mockRedis);
  });

  afterEach(() => {
    setRedisClient(null as unknown as RedisClient);
  });

  it('returns 0 for non-existent key', async () => {
    expect(await getCounter('missing-key')).toBe(0);
  });

  it('returns current count', async () => {
    store.set('my-key', '42');
    expect(await getCounter('my-key')).toBe(42);
  });

  it('returns 0 when Redis is unavailable', async () => {
    setRedisClient(null as unknown as RedisClient);
    expect(await getCounter('any-key')).toBe(0);
  });
});

// ── getTenantDailyLimit ───────────────────────────────────────

describe('getTenantDailyLimit', () => {
  const originalEnv = process.env.TENANT_RATE_LIMIT_PER_DAY;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.TENANT_RATE_LIMIT_PER_DAY;
    } else {
      process.env.TENANT_RATE_LIMIT_PER_DAY = originalEnv;
    }
  });

  it('returns 10000 by default', () => {
    delete process.env.TENANT_RATE_LIMIT_PER_DAY;
    expect(getTenantDailyLimit()).toBe(10_000);
  });

  it('reads from TENANT_RATE_LIMIT_PER_DAY env var', () => {
    process.env.TENANT_RATE_LIMIT_PER_DAY = '5000';
    expect(getTenantDailyLimit()).toBe(5000);
  });

  it('falls back to default for invalid env value', () => {
    process.env.TENANT_RATE_LIMIT_PER_DAY = 'not-a-number';
    expect(getTenantDailyLimit()).toBe(10_000);
  });
});

// ── userAiRateLimit middleware ────────────────────────────────

describe('userAiRateLimit', () => {
  let store: Map<string, string>;
  let mockRedis: RedisClient;

  beforeEach(() => {
    store = new Map();
    mockRedis = makeMockRedis(store);
    setRedisClient(mockRedis);
  });

  afterEach(() => {
    setRedisClient(null as unknown as RedisClient);
  });

  it('calls next() when under the limit', async () => {
    const middleware = userAiRateLimit();
    const req = makeAuthReq();
    const res = makeRes();
    const next = jest.fn() as NextFunction;

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('sets X-RateLimit headers', async () => {
    const middleware = userAiRateLimit();
    const req = makeAuthReq();
    const res = makeRes();
    const next = jest.fn() as NextFunction;

    await middleware(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', String(USER_AI_DAILY_LIMIT));
    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', String(USER_AI_DAILY_LIMIT - 1));
  });

  it('returns 429 when limit is exceeded', async () => {
    const today = new Date().toISOString().slice(0, 10);
    store.set(`rl:user:ai:user-1:${today}`, String(USER_AI_DAILY_LIMIT));

    const middleware = userAiRateLimit();
    const req = makeAuthReq();
    const res = makeRes();
    const next = jest.fn() as NextFunction;

    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ limit: USER_AI_DAILY_LIMIT }),
    );
  });

  it('sets Retry-After header on 429', async () => {
    const today = new Date().toISOString().slice(0, 10);
    store.set(`rl:user:ai:user-1:${today}`, String(USER_AI_DAILY_LIMIT));

    const middleware = userAiRateLimit();
    const req = makeAuthReq();
    const res = makeRes();
    const next = jest.fn() as NextFunction;

    await middleware(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', String(WINDOW_SECONDS_DAY));
  });

  it('calls next() when user is not authenticated (let auth middleware handle it)', async () => {
    const middleware = userAiRateLimit();
    const req = { method: 'POST', path: '/api/v1/ai/chat', headers: {} } as Request;
    const res = makeRes();
    const next = jest.fn() as NextFunction;

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('fails open when Redis is unavailable', async () => {
    setRedisClient(null as unknown as RedisClient);
    const middleware = userAiRateLimit();
    const req = makeAuthReq();
    const res = makeRes();
    const next = jest.fn() as NextFunction;

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('allows exactly USER_AI_DAILY_LIMIT requests before blocking', async () => {
    const middleware = userAiRateLimit();
    const next = jest.fn();

    // Make USER_AI_DAILY_LIMIT requests — all should pass
    for (let i = 0; i < USER_AI_DAILY_LIMIT; i++) {
      const req = makeAuthReq('user-limit-test');
      const res = makeRes();
      next.mockClear();
      await middleware(req, res, next as unknown as NextFunction);
      expect(next).toHaveBeenCalled();
    }

    // The (limit + 1)th request should be blocked
    const req = makeAuthReq('user-limit-test');
    const res = makeRes();
    next.mockClear();
    await middleware(req, res, next as unknown as NextFunction);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(429);
  });
});

// ── tenantRateLimit middleware ────────────────────────────────

describe('tenantRateLimit', () => {
  let store: Map<string, string>;
  let mockRedis: RedisClient;

  beforeEach(() => {
    store = new Map();
    mockRedis = makeMockRedis(store);
    setRedisClient(mockRedis);
  });

  afterEach(() => {
    setRedisClient(null as unknown as RedisClient);
    delete process.env.TENANT_RATE_LIMIT_PER_DAY;
  });

  it('calls next() when under the limit', async () => {
    const middleware = tenantRateLimit({ limit: 100, windowLabel: 'test-window' });
    const req = makeAuthReq();
    const res = makeRes();
    const next = jest.fn() as NextFunction;

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('sets X-Tenant-RateLimit headers', async () => {
    const middleware = tenantRateLimit({ limit: 100, windowLabel: 'test-window' });
    const req = makeAuthReq();
    const res = makeRes();
    const next = jest.fn() as NextFunction;

    await middleware(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('X-Tenant-RateLimit-Limit', '100');
    expect(res.setHeader).toHaveBeenCalledWith('X-Tenant-RateLimit-Remaining', '99');
  });

  it('returns 429 when tenant limit is exceeded', async () => {
    store.set('rl:tenant:tenant-1:test-window', '100');

    const middleware = tenantRateLimit({ limit: 100, windowLabel: 'test-window' });
    const req = makeAuthReq();
    const res = makeRes();
    const next = jest.fn() as NextFunction;

    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(429);
  });

  it('uses TENANT_RATE_LIMIT_PER_DAY env var for default limit', async () => {
    process.env.TENANT_RATE_LIMIT_PER_DAY = '50';
    store.set('rl:tenant:tenant-1:env-window', '50');

    const middleware = tenantRateLimit({ windowLabel: 'env-window' });
    const req = makeAuthReq();
    const res = makeRes();
    const next = jest.fn() as NextFunction;

    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(429);
  });

  it('fails open when Redis is unavailable', async () => {
    setRedisClient(null as unknown as RedisClient);
    const middleware = tenantRateLimit({ limit: 10 });
    const req = makeAuthReq();
    const res = makeRes();
    const next = jest.fn() as NextFunction;

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('calls next() when user is not authenticated', async () => {
    const middleware = tenantRateLimit({ limit: 100 });
    const req = { method: 'GET', path: '/', headers: {} } as Request;
    const res = makeRes();
    const next = jest.fn() as NextFunction;

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});
