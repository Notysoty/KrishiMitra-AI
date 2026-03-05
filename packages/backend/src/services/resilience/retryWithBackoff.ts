/**
 * Exponential backoff retry utility with configurable max retries and base delay.
 *
 * Requirements: 31.2
 */

import { RetryOptions } from '../../types/resilience';

const DEFAULT_OPTIONS: RetryOptions = {
  maxRetries: 3,
  baseDelayMs: 1_000,
  maxDelayMs: 30_000,
};

/**
 * Retry an async function with exponential backoff.
 * Throws the last error if all retries are exhausted.
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {},
): Promise<T> {
  const opts: Required<RetryOptions> = {
    ...DEFAULT_OPTIONS,
    ...options,
    maxDelayMs: options.maxDelayMs ?? DEFAULT_OPTIONS.maxDelayMs!,
  };

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt === opts.maxRetries) break;

      const delay = Math.min(
        opts.baseDelayMs * Math.pow(2, attempt),
        opts.maxDelayMs,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError ?? new Error('retryWithBackoff: all retries exhausted');
}
