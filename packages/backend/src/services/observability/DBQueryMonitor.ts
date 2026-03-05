/**
 * Database query performance monitoring.
 * Logs all queries, flags slow queries (>2s), and provides performance summaries.
 *
 * Requirements: 29.10
 */

import { DBQueryLog } from '../../types/observability';
import { Logger } from './Logger';

export const SLOW_QUERY_THRESHOLD_MS = 2000;

export interface DBQueryMonitorOptions {
  logger: Logger;
  slowThresholdMs?: number;
  /** Callback fired when a slow query is detected */
  onSlowQuery?: (log: DBQueryLog) => void;
}

export class DBQueryMonitor {
  private logger: Logger;
  private slowThresholdMs: number;
  private queryLogs: DBQueryLog[] = [];
  private onSlowQuery?: (log: DBQueryLog) => void;

  constructor(options: DBQueryMonitorOptions) {
    this.logger = options.logger;
    this.slowThresholdMs = options.slowThresholdMs ?? SLOW_QUERY_THRESHOLD_MS;
    this.onSlowQuery = options.onSlowQuery;
  }

  // ── Record a query ────────────────────────────────────────

  recordQuery(params: {
    query: string;
    durationMs: number;
    rowCount?: number;
    service: string;
    tenantId?: string;
  }): DBQueryLog {
    const slow = params.durationMs > this.slowThresholdMs;

    const log: DBQueryLog = {
      timestamp: new Date().toISOString(),
      query: params.query,
      durationMs: params.durationMs,
      rowCount: params.rowCount,
      service: params.service,
      tenantId: params.tenantId,
      slow,
    };

    this.queryLogs.push(log);

    if (slow) {
      this.logger.warn('Slow database query detected', {
        query: params.query,
        durationMs: params.durationMs,
        service: params.service,
        tenantId: params.tenantId,
      });

      if (this.onSlowQuery) {
        this.onSlowQuery(log);
      }
    } else {
      this.logger.debug('Database query executed', {
        query: params.query,
        durationMs: params.durationMs,
        service: params.service,
      });
    }

    return log;
  }

  // ── Summaries ─────────────────────────────────────────────

  getSlowQueries(since?: Date): DBQueryLog[] {
    const logs = since
      ? this.queryLogs.filter((l) => l.slow && new Date(l.timestamp) >= since)
      : this.queryLogs.filter((l) => l.slow);
    return [...logs];
  }

  getQueryStats(): {
    totalQueries: number;
    slowQueries: number;
    avgDurationMs: number;
    maxDurationMs: number;
    p95DurationMs: number;
  } {
    if (this.queryLogs.length === 0) {
      return { totalQueries: 0, slowQueries: 0, avgDurationMs: 0, maxDurationMs: 0, p95DurationMs: 0 };
    }

    const durations = this.queryLogs.map((l) => l.durationMs).sort((a, b) => a - b);
    const total = durations.reduce((s, d) => s + d, 0);
    const p95Idx = Math.max(0, Math.ceil(0.95 * durations.length) - 1);

    return {
      totalQueries: this.queryLogs.length,
      slowQueries: this.queryLogs.filter((l) => l.slow).length,
      avgDurationMs: total / durations.length,
      maxDurationMs: durations[durations.length - 1],
      p95DurationMs: durations[p95Idx],
    };
  }

  getSlowThresholdMs(): number {
    return this.slowThresholdMs;
  }

  getQueryLogs(): DBQueryLog[] {
    return [...this.queryLogs];
  }

  /** Prune old logs to prevent unbounded memory growth. */
  prune(olderThanMs: number): number {
    const cutoff = Date.now() - olderThanMs;
    const before = this.queryLogs.length;
    this.queryLogs = this.queryLogs.filter((l) => new Date(l.timestamp).getTime() >= cutoff);
    return before - this.queryLogs.length;
  }
}
