/**
 * Types for error handling, circuit breakers, retry strategies, and health checks.
 * Requirements: 31.1, 31.2, 31.3, 31.4, 31.5, 31.6, 31.7, 31.8, 31.9, 31.10
 */

export enum CircuitState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half-open',
}

export interface CircuitBreakerOptions {
  /** Number of failures before opening the circuit */
  failureThreshold: number;
  /** Time in ms before attempting half-open */
  resetTimeoutMs: number;
  /** Number of successes in half-open before closing */
  halfOpenSuccessThreshold?: number;
}

export interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  /** Optional maximum delay cap in ms */
  maxDelayMs?: number;
}

export interface CachedFallbackEntry<T = unknown> {
  data: T;
  cachedAt: number;
  stale: boolean;
}

export interface HealthCheckResult {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyMs?: number;
  message?: string;
  checkedAt: string;
}

export interface HealthReport {
  status: 'healthy' | 'degraded' | 'unhealthy';
  services: HealthCheckResult[];
  checkedAt: string;
}

export interface UploadChunkMeta {
  uploadId: string;
  fileName: string;
  totalChunks: number;
  completedChunks: number[];
  totalSize: number;
}

export interface UserFriendlyError {
  error: string;
  errorId: string;
}

export interface FieldValidationError {
  field: string;
  message: string;
  code: string;
}
