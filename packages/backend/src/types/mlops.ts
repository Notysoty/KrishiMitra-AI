/**
 * Type definitions for ML Operations: model monitoring, versioning, A/B testing, and reporting.
 * Requirements: 30.1–30.10
 */

// ── Inference Metrics ─────────────────────────────────────────

export interface InferenceRecord {
  timestamp: string;
  modelName: string;
  modelVersion: string;
  tenantId?: string;
  latencyMs: number;
  success: boolean;
  confidenceScore?: number;
  error?: string;
}

export interface ModelPerformanceMetrics {
  modelName: string;
  modelVersion: string;
  totalInferences: number;
  successCount: number;
  errorCount: number;
  errorRate: number;
  throughput: number; // inferences per minute
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  periodStart: Date;
  periodEnd: Date;
}

// ── Confidence Score Distribution ─────────────────────────────

export interface ConfidenceDistribution {
  modelName: string;
  modelVersion: string;
  buckets: ConfidenceBucket[];
  mean: number;
  median: number;
  stdDev: number;
  sampleCount: number;
  degraded: boolean;
}

export interface ConfidenceBucket {
  rangeStart: number;
  rangeEnd: number;
  count: number;
  percentage: number;
}

// ── Benchmark Evaluation ──────────────────────────────────────

export interface BenchmarkResult {
  modelName: string;
  modelVersion: string;
  datasetName: string;
  accuracy: number;
  evaluatedAt: string;
  sampleCount: number;
  belowThreshold: boolean;
}

// ── Cost Tracking ─────────────────────────────────────────────

export interface ModelCostRecord {
  timestamp: string;
  modelName: string;
  provider: string;
  tenantId?: string;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
}

export interface CostSummary {
  totalCostUsd: number;
  byModel: Record<string, number>;
  byTenant: Record<string, number>;
  periodStart: Date;
  periodEnd: Date;
}

// ── User Feedback / Flagging ──────────────────────────────────

export interface UserFeedbackRecord {
  id: string;
  timestamp: string;
  modelName: string;
  modelVersion: string;
  tenantId?: string;
  userId?: string;
  queryText?: string;
  responseText?: string;
  reason: string;
  reviewed: boolean;
}

// ── Model Versioning ──────────────────────────────────────────

export interface ModelVersionEntry {
  modelName: string;
  version: string;
  deployedAt: string;
  status: 'active' | 'inactive' | 'rollback';
  metadata?: Record<string, unknown>;
}

// ── A/B Testing ───────────────────────────────────────────────

export interface ABTestConfig {
  id: string;
  modelName: string;
  controlVersion: string;
  treatmentVersion: string;
  trafficSplitPercent: number; // percentage routed to treatment
  startedAt: string;
  endedAt?: string;
  status: 'active' | 'completed' | 'cancelled';
}

export interface ABTestResult {
  testId: string;
  controlMetrics: ModelPerformanceMetrics;
  treatmentMetrics: ModelPerformanceMetrics;
  controlConfidence: ConfidenceDistribution;
  treatmentConfidence: ConfidenceDistribution;
}

// ── Reports ───────────────────────────────────────────────────

export interface DailyPerformanceReport {
  date: string;
  models: ModelPerformanceMetrics[];
  costSummary: CostSummary;
  degradationAlerts: string[];
}

export interface WeeklyReport {
  weekStart: string;
  weekEnd: string;
  dailyReports: DailyPerformanceReport[];
  overallCost: CostSummary;
  benchmarkResults: BenchmarkResult[];
  abTestResults: ABTestResult[];
  recommendations: string[];
}

// ── Alert Callback ────────────────────────────────────────────

export interface MLOpsAlert {
  type: 'accuracy_drop' | 'degradation' | 'error_rate' | 'cost_threshold';
  modelName: string;
  modelVersion: string;
  message: string;
  timestamp: string;
  details?: Record<string, unknown>;
}
