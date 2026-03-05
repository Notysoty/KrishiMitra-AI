/**
 * Cached fallback service for graceful degradation.
 * Stores last-known-good responses and serves them when primary services fail.
 *
 * Requirements: 31.1, 31.3
 */

import { CachedFallbackEntry } from '../../types/resilience';

export interface CachedFallbackOptions {
  /** Maximum age in ms before cached data is considered stale */
  staleTtlMs: number;
  /** Maximum number of entries to keep in cache */
  maxEntries?: number;
}

const DEFAULT_OPTIONS: CachedFallbackOptions = {
  staleTtlMs: 5 * 60 * 1_000, // 5 minutes
  maxEntries: 1_000,
};

export class CachedFallback {
  private cache = new Map<string, CachedFallbackEntry>();
  private readonly options: Required<CachedFallbackOptions>;

  constructor(options: Partial<CachedFallbackOptions> = {}) {
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
      maxEntries: options.maxEntries ?? DEFAULT_OPTIONS.maxEntries!,
    };
  }

  /**
   * Store a successful response in the cache.
   */
  set<T>(key: string, data: T): void {
    // Evict oldest entry if at capacity
    if (this.cache.size >= this.options.maxEntries && !this.cache.has(key)) {
      const firstKey = this.cache.keys().next().value as string;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      data,
      cachedAt: Date.now(),
      stale: false,
    });
  }

  /**
   * Retrieve cached data. Returns null if no cached entry exists.
   * Marks entry as stale if it exceeds the TTL.
   */
  get<T>(key: string): CachedFallbackEntry<T> | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const age = Date.now() - entry.cachedAt;
    return {
      data: entry.data as T,
      cachedAt: entry.cachedAt,
      stale: age > this.options.staleTtlMs,
    };
  }

  /**
   * Execute a function with cached fallback.
   * On success, caches the result. On failure, returns cached data if available.
   */
  async executeWithFallback<T>(
    key: string,
    fn: () => Promise<T>,
  ): Promise<{ data: T; fromCache: boolean; stale: boolean }> {
    try {
      const data = await fn();
      this.set(key, data);
      return { data, fromCache: false, stale: false };
    } catch {
      const cached = this.get<T>(key);
      if (cached) {
        return { data: cached.data, fromCache: true, stale: cached.stale };
      }
      throw new Error(`Service unavailable and no cached data for key: ${key}`);
    }
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}
