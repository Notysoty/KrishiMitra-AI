import { CachedFallback } from './CachedFallback';

describe('CachedFallback', () => {
  // ── Basic cache operations ────────────────────────────────

  describe('basic cache operations', () => {
    it('should store and retrieve data', () => {
      const cache = new CachedFallback();
      cache.set('key1', { price: 100 });

      const entry = cache.get<{ price: number }>('key1');
      expect(entry).not.toBeNull();
      expect(entry!.data.price).toBe(100);
      expect(entry!.stale).toBe(false);
    });

    it('should return null for missing keys', () => {
      const cache = new CachedFallback();
      expect(cache.get('missing')).toBeNull();
    });

    it('should report has correctly', () => {
      const cache = new CachedFallback();
      cache.set('a', 1);
      expect(cache.has('a')).toBe(true);
      expect(cache.has('b')).toBe(false);
    });

    it('should delete entries', () => {
      const cache = new CachedFallback();
      cache.set('a', 1);
      expect(cache.delete('a')).toBe(true);
      expect(cache.has('a')).toBe(false);
    });

    it('should clear all entries', () => {
      const cache = new CachedFallback();
      cache.set('a', 1);
      cache.set('b', 2);
      cache.clear();
      expect(cache.size()).toBe(0);
    });
  });

  // ── Staleness ─────────────────────────────────────────────

  describe('staleness', () => {
    it('should mark entries as stale after TTL', async () => {
      const cache = new CachedFallback({ staleTtlMs: 50 });
      cache.set('key', 'data');

      await new Promise((r) => setTimeout(r, 60));

      const entry = cache.get('key');
      expect(entry).not.toBeNull();
      expect(entry!.stale).toBe(true);
    });

    it('should not be stale within TTL', () => {
      const cache = new CachedFallback({ staleTtlMs: 60_000 });
      cache.set('key', 'data');

      const entry = cache.get('key');
      expect(entry!.stale).toBe(false);
    });
  });

  // ── Max entries eviction ──────────────────────────────────

  describe('max entries', () => {
    it('should evict oldest entry when at capacity', () => {
      const cache = new CachedFallback({ maxEntries: 2 });
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      expect(cache.size()).toBe(2);
      expect(cache.has('a')).toBe(false);
      expect(cache.has('b')).toBe(true);
      expect(cache.has('c')).toBe(true);
    });
  });

  // ── executeWithFallback ───────────────────────────────────

  describe('executeWithFallback', () => {
    it('should return fresh data on success and cache it', async () => {
      const cache = new CachedFallback();
      const result = await cache.executeWithFallback('k', () =>
        Promise.resolve({ temp: 30 }),
      );

      expect(result.data.temp).toBe(30);
      expect(result.fromCache).toBe(false);
      expect(result.stale).toBe(false);
      expect(cache.has('k')).toBe(true);
    });

    it('should return cached data on failure', async () => {
      const cache = new CachedFallback();
      cache.set('k', { temp: 25 });

      const result = await cache.executeWithFallback('k', () =>
        Promise.reject(new Error('service down')),
      );

      expect(result.data).toEqual({ temp: 25 });
      expect(result.fromCache).toBe(true);
    });

    it('should throw when service fails and no cache exists', async () => {
      const cache = new CachedFallback();

      await expect(
        cache.executeWithFallback('missing', () =>
          Promise.reject(new Error('down')),
        ),
      ).rejects.toThrow('Service unavailable and no cached data');
    });
  });
});
