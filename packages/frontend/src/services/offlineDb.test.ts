// Polyfill structuredClone for test environment
if (typeof globalThis.structuredClone === 'undefined') {
  globalThis.structuredClone = <T>(val: T): T => JSON.parse(JSON.stringify(val));
}

import { cachePut, cacheGet, cacheDelete, cacheClear, cacheGetAll } from './offlineDb';

// Use fake-indexeddb for testing
import 'fake-indexeddb/auto';

describe('offlineDb', () => {
  beforeEach(async () => {
    const stores = ['prices', 'advisories', 'weather', 'general'] as const;
    for (const store of stores) {
      await cacheClear(store);
    }
  });

  it('puts and gets a cache entry', async () => {
    await cachePut('prices', 'tomato', { price: 25, market: 'Delhi' });
    const entry = await cacheGet<{ price: number; market: string }>('prices', 'tomato');
    expect(entry).toBeDefined();
    expect(entry!.data.price).toBe(25);
    expect(entry!.data.market).toBe('Delhi');
    expect(entry!.timestamp).toBeGreaterThan(0);
  });

  it('returns undefined for missing key', async () => {
    const entry = await cacheGet('prices', 'nonexistent');
    expect(entry).toBeUndefined();
  });

  it('deletes a cache entry', async () => {
    await cachePut('weather', 'forecast-1', { temp: 35 });
    await cacheDelete('weather', 'forecast-1');
    const entry = await cacheGet('weather', 'forecast-1');
    expect(entry).toBeUndefined();
  });

  it('clears all entries in a store', async () => {
    await cachePut('advisories', 'a1', { text: 'advisory 1' });
    await cachePut('advisories', 'a2', { text: 'advisory 2' });
    await cacheClear('advisories');
    const all = await cacheGetAll('advisories');
    expect(all).toHaveLength(0);
  });

  it('gets all entries from a store', async () => {
    await cachePut('general', 'k1', 'value1');
    await cachePut('general', 'k2', 'value2');
    const all = await cacheGetAll<string>('general');
    expect(all).toHaveLength(2);
  });

  it('overwrites existing entry with same key', async () => {
    await cachePut('prices', 'rice', { price: 30 });
    await cachePut('prices', 'rice', { price: 35 });
    const entry = await cacheGet<{ price: number }>('prices', 'rice');
    expect(entry!.data.price).toBe(35);
  });
});
