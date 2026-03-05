/**
 * Resilience module – circuit breakers, retry strategies, cached fallback,
 * error handling, resumable uploads, and health checks.
 *
 * Requirements: 31.1–31.10
 */

export { CircuitBreaker } from './CircuitBreaker';
export { retryWithBackoff } from './retryWithBackoff';
export { CachedFallback } from './CachedFallback';
export type { CachedFallbackOptions } from './CachedFallback';
export { AppValidationError, toUserFriendlyError, toInternalErrorLog } from './errors';
export { ResumableUpload } from './ResumableUpload';
export { HealthCheck } from './HealthCheck';
export type { HealthChecker } from './HealthCheck';
