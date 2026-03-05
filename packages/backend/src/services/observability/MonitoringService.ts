/**
 * Monitoring service for KPI tracking, CloudWatch metrics, and alarms.
 * Tracks response time, error rate, availability, and manages alarm state.
 *
 * Requirements: 29.3, 29.4, 29.6
 */

import {
  MetricDataPoint,
  MetricUnit,
  KPISnapshot,
  AlarmConfig,
  AlarmState,
  CloudWatchMetricsClient,
} from '../../types/observability';

export const DEFAULT_NAMESPACE = 'KrishiMitra';

export const ERROR_RATE_ALARM: AlarmConfig = {
  name: 'HighErrorRate',
  metricName: 'ErrorRate',
  threshold: 1, // 1%
  comparisonOperator: 'GreaterThanThreshold',
  evaluationPeriods: 1,
  periodSeconds: 300, // 5 minutes
  statistic: 'Average',
  actionsEnabled: true,
  alarmActions: ['arn:aws:sns:ap-south-1:000000000000:krishimitra-ops-alerts'],
};

export interface MonitoringServiceOptions {
  namespace?: string;
  cloudWatchClient?: CloudWatchMetricsClient;
  /** Window size in ms for KPI calculations (default 5 min) */
  windowMs?: number;
}

interface RequestRecord {
  timestamp: number;
  durationMs: number;
  success: boolean;
}

export class MonitoringService {
  private namespace: string;
  private cloudWatchClient?: CloudWatchMetricsClient;
  private windowMs: number;
  private records: RequestRecord[] = [];
  private alarmsCreated: Map<string, AlarmConfig> = new Map();

  constructor(options: MonitoringServiceOptions = {}) {
    this.namespace = options.namespace ?? DEFAULT_NAMESPACE;
    this.cloudWatchClient = options.cloudWatchClient;
    this.windowMs = options.windowMs ?? 5 * 60 * 1000;
  }

  // ── Record requests ───────────────────────────────────────

  recordRequest(durationMs: number, success: boolean): void {
    this.records.push({ timestamp: Date.now(), durationMs, success });
  }

  // ── KPI Snapshot ──────────────────────────────────────────

  getKPISnapshot(): KPISnapshot {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    const windowRecords = this.records.filter((r) => r.timestamp >= windowStart);

    if (windowRecords.length === 0) {
      return {
        responseTimeP50Ms: 0,
        responseTimeP95Ms: 0,
        responseTimeP99Ms: 0,
        errorRate: 0,
        availability: 100,
        requestCount: 0,
        periodStart: new Date(windowStart),
        periodEnd: new Date(now),
      };
    }

    const durations = windowRecords.map((r) => r.durationMs).sort((a, b) => a - b);
    const errors = windowRecords.filter((r) => !r.success).length;

    return {
      responseTimeP50Ms: percentile(durations, 50),
      responseTimeP95Ms: percentile(durations, 95),
      responseTimeP99Ms: percentile(durations, 99),
      errorRate: (errors / windowRecords.length) * 100,
      availability: ((windowRecords.length - errors) / windowRecords.length) * 100,
      requestCount: windowRecords.length,
      periodStart: new Date(windowStart),
      periodEnd: new Date(now),
    };
  }

  // ── Publish metrics to CloudWatch ─────────────────────────

  async publishKPIs(): Promise<MetricDataPoint[]> {
    const snapshot = this.getKPISnapshot();
    const now = new Date();

    const metrics: MetricDataPoint[] = [
      { name: 'ResponseTimeP50', value: snapshot.responseTimeP50Ms, unit: MetricUnit.MILLISECONDS, timestamp: now },
      { name: 'ResponseTimeP95', value: snapshot.responseTimeP95Ms, unit: MetricUnit.MILLISECONDS, timestamp: now },
      { name: 'ResponseTimeP99', value: snapshot.responseTimeP99Ms, unit: MetricUnit.MILLISECONDS, timestamp: now },
      { name: 'ErrorRate', value: snapshot.errorRate, unit: MetricUnit.PERCENT, timestamp: now },
      { name: 'Availability', value: snapshot.availability, unit: MetricUnit.PERCENT, timestamp: now },
      { name: 'RequestCount', value: snapshot.requestCount, unit: MetricUnit.COUNT, timestamp: now },
    ];

    if (this.cloudWatchClient) {
      await this.cloudWatchClient.putMetricData(this.namespace, metrics);
    }

    return metrics;
  }

  // ── Alarm management ──────────────────────────────────────

  async createErrorRateAlarm(overrides?: Partial<AlarmConfig>): Promise<AlarmConfig> {
    const config: AlarmConfig = { ...ERROR_RATE_ALARM, ...overrides };
    this.alarmsCreated.set(config.name, config);

    if (this.cloudWatchClient) {
      await this.cloudWatchClient.createAlarm(config);
    }

    return config;
  }

  async createCustomAlarm(config: AlarmConfig): Promise<AlarmConfig> {
    this.alarmsCreated.set(config.name, config);

    if (this.cloudWatchClient) {
      await this.cloudWatchClient.createAlarm(config);
    }

    return config;
  }

  async getAlarmState(alarmName: string): Promise<AlarmState | undefined> {
    if (!this.cloudWatchClient) {
      return undefined;
    }
    return this.cloudWatchClient.getAlarmState(alarmName);
  }

  /**
   * Check if the current error rate exceeds the alarm threshold.
   * Returns true when error rate > threshold over the configured window.
   */
  isErrorRateBreached(thresholdPercent: number = ERROR_RATE_ALARM.threshold): boolean {
    const snapshot = this.getKPISnapshot();
    return snapshot.requestCount > 0 && snapshot.errorRate > thresholdPercent;
  }

  // ── Housekeeping ──────────────────────────────────────────

  /** Prune records older than the window to prevent unbounded memory growth. */
  prune(): number {
    const cutoff = Date.now() - this.windowMs * 2;
    const before = this.records.length;
    this.records = this.records.filter((r) => r.timestamp >= cutoff);
    return before - this.records.length;
  }

  getRecordCount(): number {
    return this.records.length;
  }

  getAlarmsCreated(): AlarmConfig[] {
    return Array.from(this.alarmsCreated.values());
  }

  getNamespace(): string {
    return this.namespace;
  }
}

// ── Helpers ─────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}
