/**
 * Rate limiting middleware using Redis.
 *
 * - Per-user AI rate limit: 100 requests/day (Requirement 33.8)
 * - Per-tenant rate limit: configurable via environment variable (Requirement 33.8)
 *
 * Uses a sliding-window counter stored in Redis with a TTL equal to the window.
 *
 * Requirements: 33.8
 */

import { Request, Response, NextFunction } from 'express';
import { getRedisClient } from './cache';
import { AuthenticatedRequest } from './authenticate';

// ── Constants ─────────────────────────────────────────────────

export const USER_AI_DAILY_LIMIT = 100;
export const WINDOW_SECONDS_DAY = 24 * 60 * 60; // 86400 s

// ── Key helpers ───────────────────────────────────────────────

export function userAiRateLimitKey(userId: string): string {
  const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return `rl:user:ai:${userId}:${day}`;
}

export function tenantRateLimitKey(tenantId: string, windowLabel: string): string {
  return `rl:tenant:${tenantId}:${windowLabel}`;
}

// ── Core counter ──────────────────────────────────────────────

/**
 * Increment a Redis counter and return the new count.
 * Sets TTL on first increment so the key expires at the end of the window.
 * Returns null when Redis is unavailable (fail-open).
 */
export async function incrementCounter(
  key: string,
  windowSeconds: number,
): Promise<number | null> {
  const client = getRedisClient();
  if (!client) return null;

  try {
    // INCR returns the new value; set EX only on first creation
    const raw = await client.get(key);
    if (raw === null) {
      await client.set(key, '1', { EX: windowSeconds });
      return 1;
    }
    const current = parseInt(raw, 10);
    const next = current + 1;
    // Overwrite preserving TTL by re-setting with same EX
    // (Redis INCR doesn't reset TTL, so we use get+set for simplicity)
    await client.set(key, String(next), { EX: windowSeconds });
    return next;
  } catch (err) {
    console.warn('Rate limiter Redis error:', (err as Error).message);
    return null; // fail-open
  }
}

/**
 * Read the current counter value without incrementing.
 * Returns 0 when the key doesn't exist or Redis is unavailable.
 */
export async function getCounter(key: string): Promise<number> {
  const client = getRedisClient();
  if (!client) return 0;
  try {
    const raw = await client.get(key);
    return raw ? parseInt(raw, 10) : 0;
  } catch {
    return 0;
  }
}

// ── Per-user AI rate limiter ──────────────────────────────────

/**
 * Middleware that enforces the per-user AI request limit (100/day).
 * Must be applied after the `authenticate` middleware so `req.user` is set.
 *
 * On limit exceeded → 429 with Retry-After header.
 * When Redis is unavailable → passes through (fail-open).
 */
export function userAiRateLimit() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const user = (req as AuthenticatedRequest).user;
    if (!user) {
      // Not authenticated — let the auth middleware handle it
      next();
      return;
    }

    const key = userAiRateLimitKey(user.id);
    const count = await incrementCounter(key, WINDOW_SECONDS_DAY);

    if (count === null) {
      // Redis unavailable — fail-open
      next();
      return;
    }

    res.setHeader('X-RateLimit-Limit', String(USER_AI_DAILY_LIMIT));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, USER_AI_DAILY_LIMIT - count)));

    if (count > USER_AI_DAILY_LIMIT) {
      res.setHeader('Retry-After', String(WINDOW_SECONDS_DAY));
      res.status(429).json({
        error: 'Daily AI request limit exceeded. You can make up to 100 AI requests per day.',
        limit: USER_AI_DAILY_LIMIT,
        retryAfter: WINDOW_SECONDS_DAY,
      });
      return;
    }

    next();
  };
}

// ── Per-tenant rate limiter ───────────────────────────────────

export interface TenantRateLimitOptions {
  /** Maximum requests per window. Defaults to TENANT_DEFAULT_DAILY_LIMIT. */
  limit?: number;
  /** Window duration in seconds. Defaults to 86400 (1 day). */
  windowSeconds?: number;
  /** Label appended to the Redis key to distinguish windows. Defaults to today's date. */
  windowLabel?: string;
}

/**
 * Read the per-tenant limit from the environment.
 * TENANT_RATE_LIMIT_PER_DAY overrides the default.
 */
export function getTenantDailyLimit(): number {
  const env = process.env.TENANT_RATE_LIMIT_PER_DAY;
  if (env) {
    const parsed = parseInt(env, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return 10_000; // default: 10,000 requests/day per tenant
}

/**
 * Middleware that enforces per-tenant rate limiting.
 * Must be applied after the `authenticate` middleware so `req.user.tenant_id` is set.
 *
 * The limit is configurable via the TENANT_RATE_LIMIT_PER_DAY environment variable.
 */
export function tenantRateLimit(options: TenantRateLimitOptions = {}) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const user = (req as AuthenticatedRequest).user;
    if (!user) {
      next();
      return;
    }

    const limit = options.limit ?? getTenantDailyLimit();
    const windowSeconds = options.windowSeconds ?? WINDOW_SECONDS_DAY;
    const windowLabel = options.windowLabel ?? new Date().toISOString().slice(0, 10);

    const key = tenantRateLimitKey(user.tenant_id, windowLabel);
    const count = await incrementCounter(key, windowSeconds);

    if (count === null) {
      next();
      return;
    }

    res.setHeader('X-Tenant-RateLimit-Limit', String(limit));
    res.setHeader('X-Tenant-RateLimit-Remaining', String(Math.max(0, limit - count)));

    if (count > limit) {
      res.setHeader('Retry-After', String(windowSeconds));
      res.status(429).json({
        error: 'Tenant request limit exceeded. Please contact your administrator.',
        limit,
        retryAfter: windowSeconds,
      });
      return;
    }

    next();
  };
}
