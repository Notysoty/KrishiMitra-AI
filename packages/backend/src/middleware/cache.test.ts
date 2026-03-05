/**
 * Tests for Redis caching middleware.
 * Requirements: 33.5
 */

import { Request, Response, NextFunction } from 'express';
import {
  TTL_MARKET_DATA_SECONDS,
  TTL_KNOWLEDGE_BASE_SECONDS,
  buildCacheKey,
  cacheMiddleware,
  setRedisClient,
  getRedisClient,
  invalidateCache,
  marketDataCache,
  knowledgeBaseCache,
  RedisClient,
} from './cache';

// ── Mock Redis client ─────────────────────────────────────────

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

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    method: 'GET',
    path: '/api/v1/markets/prices',
    query: {},
    headers: {},
    ...overrides,
  } as unknown as Request;
}

function makeRes(): Response & { _body: unknown; _status: number } {
  const res: Partial<Response> & { _body: unknown; _status: number } = {
    _body: undefined,
    _status: 200,
    statusCode: 200,
    setHeader: jest.fn(),
    status: jest.fn().mockReturnThis(),
    send: jest.fn().mockImplementation(function (this: typeof res, body: unknown) {
      this._body = body;
      return this;
    }),
    json: jest.fn().mockImplementation(function (this: typeof res, body: unknown) {
      this._body = body;
      return this;
    }),
  };
  return res as Response & { _body: unknown; _status: number };
}

// ── TTL constants ─────────────────────────────────────────────

describe('TTL constants', () => {
  it('market data TTL is 1 hour (3600 seconds)', () => {
    expect(TTL_MARKET_DATA_SECONDS).toBe(3600);
  });

  it('knowledge base TTL is 24 hours (86400 seconds)', () => {
    expect(TTL_KNOWLEDGE_BASE_SECONDS).toBe(86400);
  });
});

// ── buildCacheKey ─────────────────────────────────────────────

describe('buildCacheKey', () => {
  it('builds key from method and path', () => {
    const req = makeReq({ method: 'GET', path: '/api/v1/markets/prices', query: {} });
    expect(buildCacheKey(req)).toBe('GET:/api/v1/markets/prices');
  });

  it('includes query string in key', () => {
    const req = makeReq({ query: { crop: 'wheat' } as Record<string, string> });
    const key = buildCacheKey(req);
    expect(key).toContain('wheat');
  });

  it('includes prefix when provided', () => {
    const req = makeReq();
    expect(buildCacheKey(req, 'market')).toMatch(/^market:/);
  });

  it('includes tenant_id when user is present', () => {
    const req = makeReq();
    (req as Request & { user: { tenant_id: string } }).user = { tenant_id: 'tenant-abc' };
    const key = buildCacheKey(req);
    expect(key).toContain('tenant-abc');
  });

  it('does not include tenant when user is absent', () => {
    const req = makeReq();
    const key = buildCacheKey(req);
    expect(key).not.toContain(':t:');
  });
});

// ── setRedisClient / getRedisClient ───────────────────────────

describe('Redis client management', () => {
  afterEach(() => setRedisClient(null as unknown as RedisClient));

  it('getRedisClient returns null before initialization', () => {
    setRedisClient(null as unknown as RedisClient);
    expect(getRedisClient()).toBeNull();
  });

  it('setRedisClient stores the client', () => {
    const mock = makeMockRedis();
    setRedisClient(mock);
    expect(getRedisClient()).toBe(mock);
  });
});

// ── cacheMiddleware ───────────────────────────────────────────

describe('cacheMiddleware', () => {
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

  it('passes through non-GET requests without caching', async () => {
    const middleware = cacheMiddleware({ ttl: 60 });
    const req = makeReq({ method: 'POST' });
    const res = makeRes();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(mockRedis.get).not.toHaveBeenCalled();
  });

  it('passes through when Redis is unavailable', async () => {
    setRedisClient(null as unknown as RedisClient);
    const middleware = cacheMiddleware({ ttl: 60 });
    const req = makeReq();
    const res = makeRes();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('returns cached response on cache hit with X-Cache: HIT header', async () => {
    const cachedBody = JSON.stringify({ prices: [{ crop: 'wheat', price: 100 }] });
    store.set('GET:/api/v1/markets/prices', cachedBody);

    const middleware = cacheMiddleware({ ttl: 3600 });
    const req = makeReq();
    const res = makeRes();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith('X-Cache', 'HIT');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('calls next on cache miss and stores response', async () => {
    const middleware = cacheMiddleware({ ttl: 3600 });
    const req = makeReq();
    const res = makeRes();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();

    // Simulate the route handler calling res.json
    res.json({ prices: [] });

    expect(mockRedis.set).toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith('X-Cache', 'MISS');
  });

  it('does not cache error responses (4xx/5xx)', async () => {
    const middleware = cacheMiddleware({ ttl: 3600 });
    const req = makeReq();
    const res = makeRes();
    res.statusCode = 500;
    const next = jest.fn();

    await middleware(req, res, next);
    res.json({ error: 'Internal server error' });

    expect(mockRedis.set).not.toHaveBeenCalled();
  });

  it('uses prefix in cache key', async () => {
    const middleware = cacheMiddleware({ ttl: 60, prefix: 'market' });
    const req = makeReq();
    const res = makeRes();
    const next = jest.fn();

    await middleware(req, res, next);
    res.json({ data: 'test' });

    const setCalls = (mockRedis.set as jest.Mock).mock.calls;
    expect(setCalls.length).toBeGreaterThan(0);
    expect(setCalls[0][0]).toMatch(/^market:/);
  });

  it('skips caching when keyBuilder returns null', async () => {
    const middleware = cacheMiddleware({ ttl: 60, keyBuilder: () => null });
    const req = makeReq();
    const res = makeRes();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(mockRedis.get).not.toHaveBeenCalled();
  });

  it('stores response with correct TTL', async () => {
    const middleware = cacheMiddleware({ ttl: 3600 });
    const req = makeReq();
    const res = makeRes();
    const next = jest.fn();

    await middleware(req, res, next);
    res.json({ data: 'test' });

    const setCalls = (mockRedis.set as jest.Mock).mock.calls;
    expect(setCalls[0][2]).toEqual({ EX: 3600 });
  });

  it('degrades gracefully when Redis get throws', async () => {
    (mockRedis.get as jest.Mock).mockRejectedValueOnce(new Error('Redis down'));
    const middleware = cacheMiddleware({ ttl: 60 });
    const req = makeReq();
    const res = makeRes();
    const next = jest.fn();

    await expect(middleware(req, res, next)).resolves.not.toThrow();
    expect(next).toHaveBeenCalled();
  });
});

// ── marketDataCache / knowledgeBaseCache ──────────────────────

describe('pre-configured cache middleware', () => {
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

  it('marketDataCache uses 1-hour TTL', async () => {
    const req = makeReq();
    const res = makeRes();
    const next = jest.fn();

    await marketDataCache(req, res, next);
    res.json({ prices: [] });

    const setCalls = (mockRedis.set as jest.Mock).mock.calls;
    expect(setCalls[0][2]).toEqual({ EX: TTL_MARKET_DATA_SECONDS });
  });

  it('knowledgeBaseCache uses 24-hour TTL', async () => {
    const req = makeReq({ path: '/api/v1/knowledge/articles' });
    const res = makeRes();
    const next = jest.fn();

    await knowledgeBaseCache(req, res, next);
    res.json({ articles: [] });

    const setCalls = (mockRedis.set as jest.Mock).mock.calls;
    expect(setCalls[0][2]).toEqual({ EX: TTL_KNOWLEDGE_BASE_SECONDS });
  });
});

// ── invalidateCache ───────────────────────────────────────────

describe('invalidateCache', () => {
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

  it('deletes the specified key', async () => {
    store.set('market:GET:/api/v1/markets/prices', '{"prices":[]}');
    await invalidateCache('market:GET:/api/v1/markets/prices');
    expect(mockRedis.del).toHaveBeenCalledWith('market:GET:/api/v1/markets/prices');
  });

  it('does nothing when Redis is unavailable', async () => {
    setRedisClient(null as unknown as RedisClient);
    await expect(invalidateCache('some-key')).resolves.not.toThrow();
  });

  it('does not throw when del fails', async () => {
    (mockRedis.del as jest.Mock).mockRejectedValueOnce(new Error('Redis error'));
    await expect(invalidateCache('some-key')).resolves.not.toThrow();
  });
});
