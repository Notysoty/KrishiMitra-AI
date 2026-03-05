/**
 * Redis caching middleware for Express routes.
 *
 * - 1-hour TTL for market data (Requirement 33.5)
 * - 24-hour TTL for knowledge base content (Requirement 33.5)
 * - Generic cache-aside pattern for any route
 *
 * Requirements: 33.5
 */

import { Request, Response, NextFunction } from 'express';

// ── TTL constants ─────────────────────────────────────────────

export const TTL_MARKET_DATA_SECONDS = 60 * 60;        // 1 hour
export const TTL_KNOWLEDGE_BASE_SECONDS = 24 * 60 * 60; // 24 hours

// ── Redis client abstraction ──────────────────────────────────

/**
 * Minimal interface for a Redis client so we can inject mocks in tests.
 */
export interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { EX?: number }): Promise<unknown>;
  del(key: string): Promise<unknown>;
  quit(): Promise<unknown>;
}

let redisClient: RedisClient | null = null;

export function setRedisClient(client: RedisClient): void {
  redisClient = client;
}

export function getRedisClient(): RedisClient | null {
  return redisClient;
}

/**
 * Create and connect a real Redis client using the `redis` npm package.
 * Call this once at application startup.
 */
export async function initRedisClient(): Promise<RedisClient> {
  // Dynamic import so tests can mock without loading the real redis module
  const { createClient } = await import('redis');
  const url = process.env.REDIS_URL || 'redis://localhost:6379';
  const client = createClient({ url });

  client.on('error', (err: Error) => {
    console.error('Redis client error:', err.message);
  });

  await client.connect();
  redisClient = client as unknown as RedisClient;
  return redisClient;
}

// ── Cache key helpers ─────────────────────────────────────────

/**
 * Build a deterministic cache key from the request path and query string.
 * Optionally scoped to a tenant for multi-tenant isolation.
 */
export function buildCacheKey(req: Request, prefix?: string): string {
  const base = `${req.method}:${req.path}`;
  const query = Object.keys(req.query).length
    ? `:${JSON.stringify(req.query)}`
    : '';
  const tenant = (req as Request & { user?: { tenant_id?: string } }).user?.tenant_id
    ? `:t:${(req as Request & { user?: { tenant_id?: string } }).user!.tenant_id}`
    : '';
  return prefix ? `${prefix}:${base}${query}${tenant}` : `${base}${query}${tenant}`;
}

// ── Cache middleware factory ──────────────────────────────────

export interface CacheMiddlewareOptions {
  /** TTL in seconds */
  ttl: number;
  /** Optional key prefix (e.g. "market", "knowledge") */
  prefix?: string;
  /**
   * Custom key builder. Defaults to buildCacheKey.
   * Return null to skip caching for this request.
   */
  keyBuilder?: (req: Request) => string | null;
}

/**
 * Express middleware that caches GET responses in Redis.
 *
 * On cache hit  → responds immediately with cached JSON (X-Cache: HIT).
 * On cache miss → calls next(), intercepts the response, stores it in Redis.
 *
 * Non-GET requests and requests where the key builder returns null are
 * passed through without caching.
 */
export function cacheMiddleware(options: CacheMiddlewareOptions) {
  const { ttl, prefix, keyBuilder } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      next();
      return;
    }

    const client = getRedisClient();
    if (!client) {
      // Redis not available — pass through
      next();
      return;
    }

    const key = keyBuilder ? keyBuilder(req) : buildCacheKey(req, prefix);
    if (!key) {
      next();
      return;
    }

    try {
      const cached = await client.get(key);
      if (cached !== null) {
        res.setHeader('X-Cache', 'HIT');
        res.setHeader('Content-Type', 'application/json');
        res.status(200).send(cached);
        return;
      }
    } catch (err) {
      // Cache read failure — degrade gracefully
      console.warn('Cache read error:', (err as Error).message);
    }

    // Cache miss — intercept the response to store it
    const originalJson = res.json.bind(res);
    res.json = (body: unknown): Response => {
      // Only cache successful responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const serialized = JSON.stringify(body);
        client.set(key, serialized, { EX: ttl }).catch((err: Error) => {
          console.warn('Cache write error:', err.message);
        });
      }
      res.setHeader('X-Cache', 'MISS');
      return originalJson(body);
    };

    next();
  };
}

// ── Pre-configured middleware for common data types ───────────

/** Cache middleware for market data (1-hour TTL). */
export const marketDataCache = cacheMiddleware({
  ttl: TTL_MARKET_DATA_SECONDS,
  prefix: 'market',
});

/** Cache middleware for knowledge base content (24-hour TTL). */
export const knowledgeBaseCache = cacheMiddleware({
  ttl: TTL_KNOWLEDGE_BASE_SECONDS,
  prefix: 'knowledge',
});

// ── Cache invalidation helper ─────────────────────────────────

/**
 * Delete a specific cache entry by key.
 * Use this when underlying data changes (e.g. after a market price update).
 */
export async function invalidateCache(key: string): Promise<void> {
  const client = getRedisClient();
  if (!client) return;
  try {
    await client.del(key);
  } catch (err) {
    console.warn('Cache invalidation error:', (err as Error).message);
  }
}
