import { retryWithBackoff } from './retryWithBackoff';

describe('retryWithBackoff', () => {
  it('should return result on first success', async () => {
    const result = await retryWithBackoff(() => Promise.resolve('ok'), {
      maxRetries: 3,
      baseDelayMs: 10,
    });
    expect(result).toBe('ok');
  });

  it('should retry and succeed on later attempt', async () => {
    let attempt = 0;
    const fn = () => {
      attempt++;
      if (attempt < 3) return Promise.reject(new Error('not yet'));
      return Promise.resolve('done');
    };

    const result = await retryWithBackoff(fn, { maxRetries: 3, baseDelayMs: 10 });
    expect(result).toBe('done');
    expect(attempt).toBe(3);
  });

  it('should throw after exhausting all retries', async () => {
    const fn = () => Promise.reject(new Error('always fails'));

    await expect(
      retryWithBackoff(fn, { maxRetries: 2, baseDelayMs: 10 }),
    ).rejects.toThrow('always fails');
  });

  it('should use exponential backoff delays', async () => {
    const timestamps: number[] = [];
    let attempt = 0;

    const fn = () => {
      timestamps.push(Date.now());
      attempt++;
      if (attempt <= 3) return Promise.reject(new Error('fail'));
      return Promise.resolve('ok');
    };

    await retryWithBackoff(fn, { maxRetries: 3, baseDelayMs: 50 });

    // Verify delays increase (with some tolerance for timer imprecision)
    if (timestamps.length >= 3) {
      const delay1 = timestamps[1] - timestamps[0]; // ~50ms
      const delay2 = timestamps[2] - timestamps[1]; // ~100ms
      expect(delay2).toBeGreaterThanOrEqual(delay1 * 1.5);
    }
  });

  it('should cap delay at maxDelayMs', async () => {
    let attempt = 0;
    const timestamps: number[] = [];

    const fn = () => {
      timestamps.push(Date.now());
      attempt++;
      if (attempt <= 3) return Promise.reject(new Error('fail'));
      return Promise.resolve('ok');
    };

    await retryWithBackoff(fn, { maxRetries: 3, baseDelayMs: 50, maxDelayMs: 80 });

    // Third delay should be capped at 80ms (not 200ms)
    if (timestamps.length >= 4) {
      const delay3 = timestamps[3] - timestamps[2];
      expect(delay3).toBeLessThan(150); // well under uncapped 200ms
    }
  });

  it('should work with zero retries (single attempt)', async () => {
    const result = await retryWithBackoff(() => Promise.resolve('once'), {
      maxRetries: 0,
      baseDelayMs: 10,
    });
    expect(result).toBe('once');
  });

  it('should throw on zero retries if first attempt fails', async () => {
    await expect(
      retryWithBackoff(() => Promise.reject(new Error('nope')), {
        maxRetries: 0,
        baseDelayMs: 10,
      }),
    ).rejects.toThrow('nope');
  });
});
