/**
 * Health check service for all critical services.
 * Runs registered checks and aggregates results into a health report.
 *
 * Requirements: 31.10
 */

import { HealthCheckResult, HealthReport } from '../../types/resilience';

export type HealthChecker = () => Promise<HealthCheckResult>;

export class HealthCheck {
  private checks = new Map<string, HealthChecker>();

  /**
   * Register a named health check.
   */
  register(name: string, checker: HealthChecker): void {
    this.checks.set(name, checker);
  }

  /**
   * Remove a registered health check.
   */
  unregister(name: string): boolean {
    return this.checks.delete(name);
  }

  /**
   * Run all registered health checks and return an aggregated report.
   */
  async check(): Promise<HealthReport> {
    const results: HealthCheckResult[] = [];

    const entries = Array.from(this.checks.entries());
    const settled = await Promise.allSettled(
      entries.map(async ([name, checker]) => {
        const start = Date.now();
        try {
          const result = await checker();
          return result;
        } catch (err) {
          return {
            service: name,
            status: 'unhealthy' as const,
            latencyMs: Date.now() - start,
            message: err instanceof Error ? err.message : String(err),
            checkedAt: new Date().toISOString(),
          };
        }
      }),
    );

    for (const outcome of settled) {
      if (outcome.status === 'fulfilled') {
        results.push(outcome.value);
      }
    }

    const overallStatus = deriveOverallStatus(results);

    return {
      status: overallStatus,
      services: results,
      checkedAt: new Date().toISOString(),
    };
  }

  /**
   * Run a single named health check.
   */
  async checkOne(name: string): Promise<HealthCheckResult | null> {
    const checker = this.checks.get(name);
    if (!checker) return null;

    try {
      return await checker();
    } catch (err) {
      return {
        service: name,
        status: 'unhealthy',
        message: err instanceof Error ? err.message : String(err),
        checkedAt: new Date().toISOString(),
      };
    }
  }

  getRegisteredChecks(): string[] {
    return Array.from(this.checks.keys());
  }
}

function deriveOverallStatus(
  results: HealthCheckResult[],
): 'healthy' | 'degraded' | 'unhealthy' {
  if (results.length === 0) return 'healthy';

  const hasUnhealthy = results.some((r) => r.status === 'unhealthy');
  const hasDegraded = results.some((r) => r.status === 'degraded');

  if (hasUnhealthy) return 'unhealthy';
  if (hasDegraded) return 'degraded';
  return 'healthy';
}
