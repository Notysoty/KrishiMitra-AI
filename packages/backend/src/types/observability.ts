/**
 * Type definitions for observability: structured logging, tracing, monitoring, and AI cost tracking.
 * Requirements: 29.1–29.10
 */

// ── Log Levels ────────────────────────────────────────────────

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal',
}

// ── Structured Log Entry ──────────────────────────────────────

export interface StructuredLogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  service: string;
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  tenantId?: string;
  userId?: string;
  requestId?: string;
  /** Arbitrary key-value metadata */
  metadata?: Record<string, unknown>;
  /** Error details when level is ERROR or FATAL */
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

// ── Distributed Tracing ───────────────────────────────────────

export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  sampled: boolean;
}

export interface SpanOptions {
  name: string;
  service: string;
  metadata?: Record<string, unknown>;
}

export interface Span {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  service: string;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  status: 'ok' | 'error';
  metadata?: Record<string, unknown>;
  error?: { name: string; message: string };
}

// ── KPI Metrics ───────────────────────────────────────────────

export interface MetricDataPoint {
  name: string;
  value: number;
  unit: MetricUnit;
  timestamp: Date;
  dimensions?: Record<string, string>;
}

export enum MetricUnit {
  MILLISECONDS = 'Milliseconds',
  COUNT = 'Count',
  PERCENT = 'Percent',
  BYTES = 'Bytes',
  NONE = 'None',
}

export interface KPISnapshot {
  responseTimeP50Ms: number;
  responseTimeP95Ms: number;
  responseTimeP99Ms: number;
  errorRate: number;
  availability: number;
  requestCount: number;
  periodStart: Date;
  periodEnd: Date;
}

// ── Alarm / Alert Configuration ───────────────────────────────

export interface AlarmConfig {
  name: string;
  metricName: string;
  threshold: number;
  comparisonOperator: 'GreaterThanThreshold' | 'LessThanThreshold' | 'GreaterThanOrEqualToThreshold';
  evaluationPeriods: number;
  periodSeconds: number;
  statistic: 'Average' | 'Sum' | 'Maximum' | 'Minimum' | 'SampleCount';
  actionsEnabled: boolean;
  alarmActions: string[];
}

export interface AlarmState {
  name: string;
  state: 'OK' | 'ALARM' | 'INSUFFICIENT_DATA';
  reason: string;
  updatedAt: Date;
}

// ── AI Model Invocation Logging ───────────────────────────────

export interface AIModelInvocationLog {
  timestamp: string;
  traceId?: string;
  modelName: string;
  modelVersion: string;
  provider: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  tenantId?: string;
  userId?: string;
  success: boolean;
  error?: string;
}

// ── AI Provider Cost Tracking ─────────────────────────────────

export interface AIProviderCostEntry {
  timestamp: string;
  provider: string;
  modelName: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  tenantId?: string;
}

export interface AIProviderCostSummary {
  provider: string;
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  periodStart: Date;
  periodEnd: Date;
  byModel: Record<string, { costUsd: number; inputTokens: number; outputTokens: number }>;
}

export interface BudgetAlertConfig {
  provider: string;
  monthlyBudgetUsd: number;
  alertThresholdPercent: number;
}

// ── Database Query Performance ────────────────────────────────

export interface DBQueryLog {
  timestamp: string;
  query: string;
  durationMs: number;
  rowCount?: number;
  service: string;
  tenantId?: string;
  slow: boolean;
}

// ── Log Retention ─────────────────────────────────────────────

export interface LogRetentionConfig {
  retentionDays: number;
  archiveEnabled: boolean;
  archiveDestination?: string;
}

// ── CloudWatch / X-Ray Abstractions ───────────────────────────

/** Abstraction over CloudWatch Logs for testability */
export interface CloudWatchLogsClient {
  putLogEvents(logGroupName: string, logStreamName: string, events: Array<{ timestamp: number; message: string }>): Promise<void>;
  createLogGroup(logGroupName: string, retentionDays: number): Promise<void>;
}

/** Abstraction over CloudWatch Metrics for testability */
export interface CloudWatchMetricsClient {
  putMetricData(namespace: string, metrics: MetricDataPoint[]): Promise<void>;
  createAlarm(config: AlarmConfig): Promise<void>;
  getAlarmState(alarmName: string): Promise<AlarmState>;
}

/** Abstraction over X-Ray for testability */
export interface XRayClient {
  putTraceSegment(span: Span): Promise<void>;
}
