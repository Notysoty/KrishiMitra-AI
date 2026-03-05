/**
 * ML Operations Service for model monitoring, versioning, A/B testing, and reporting.
 *
 * Tracks inference latency, throughput, error rates per model.
 * Monitors confidence score distributions to detect model degradation.
 * Alerts ML_Ops when accuracy drops below 75% on benchmarks.
 * Tracks AI provider costs and usage by model and tenant.
 * Implements model versioning with rollback capability.
 * Supports A/B testing for gradual model rollout.
 * Generates daily performance metrics and weekly reports.
 *
 * Requirements: 30.1, 30.2, 30.3, 30.4, 30.5, 30.6, 30.7, 30.8, 30.9, 30.10
 */

import {
  InferenceRecord,
  ModelPerformanceMetrics,
  ConfidenceDistribution,
  ConfidenceBucket,
  BenchmarkResult,
  ModelCostRecord,
  CostSummary,
  UserFeedbackRecord,
  ModelVersionEntry,
  ABTestConfig,
  ABTestResult,
  DailyPerformanceReport,
  WeeklyReport,
  MLOpsAlert,
} from '../../types/mlops';
import { Logger } from '../observability/Logger';

export const ACCURACY_THRESHOLD = 0.75;
export const CONFIDENCE_DEGRADATION_THRESHOLD = 0.6;
export const CONFIDENCE_BUCKET_SIZE = 0.1;

export interface MLOpsServiceOptions {
  logger: Logger;
  onAlert?: (alert: MLOpsAlert) => void;
}

export class MLOpsService {
  private logger: Logger;
  private onAlert?: (alert: MLOpsAlert) => void;

  private inferences: InferenceRecord[] = [];
  private costRecords: ModelCostRecord[] = [];
  private feedbackRecords: UserFeedbackRecord[] = [];
  private modelVersions: Map<string, ModelVersionEntry[]> = new Map();
  private abTests: Map<string, ABTestConfig> = new Map();
  private benchmarkResults: BenchmarkResult[] = [];

  constructor(options: MLOpsServiceOptions) {
    this.logger = options.logger;
    this.onAlert = options.onAlert;
  }

  // ── Inference Recording (Req 30.1) ────────────────────────

  recordInference(params: {
    modelName: string;
    modelVersion: string;
    tenantId?: string;
    latencyMs: number;
    success: boolean;
    confidenceScore?: number;
    error?: string;
  }): InferenceRecord {
    const record: InferenceRecord = {
      timestamp: new Date().toISOString(),
      ...params,
    };

    this.inferences.push(record);

    this.logger.info('ML inference recorded', {
      modelName: record.modelName,
      modelVersion: record.modelVersion,
      latencyMs: record.latencyMs,
      success: record.success,
      confidenceScore: record.confidenceScore,
    });

    return record;
  }

  // ── Performance Metrics (Req 30.1, 30.9) ──────────────────

  getPerformanceMetrics(
    modelName: string,
    modelVersion: string,
    periodStart: Date,
    periodEnd: Date,
  ): ModelPerformanceMetrics {
    const records = this.inferences.filter(
      (r) =>
        r.modelName === modelName &&
        r.modelVersion === modelVersion &&
        new Date(r.timestamp) >= periodStart &&
        new Date(r.timestamp) <= periodEnd,
    );

    const successCount = records.filter((r) => r.success).length;
    const errorCount = records.length - successCount;
    const latencies = records.map((r) => r.latencyMs).sort((a, b) => a - b);
    const durationMinutes = Math.max(
      (periodEnd.getTime() - periodStart.getTime()) / 60_000,
      1,
    );

    return {
      modelName,
      modelVersion,
      totalInferences: records.length,
      successCount,
      errorCount,
      errorRate: records.length > 0 ? (errorCount / records.length) * 100 : 0,
      throughput: records.length / durationMinutes,
      avgLatencyMs: records.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0,
      p50LatencyMs: percentile(latencies, 50),
      p95LatencyMs: percentile(latencies, 95),
      p99LatencyMs: percentile(latencies, 99),
      periodStart,
      periodEnd,
    };
  }

  // ── Confidence Distribution (Req 30.2) ─────────────────────

  getConfidenceDistribution(
    modelName: string,
    modelVersion: string,
    periodStart?: Date,
    periodEnd?: Date,
  ): ConfidenceDistribution {
    let records = this.inferences.filter(
      (r) =>
        r.modelName === modelName &&
        r.modelVersion === modelVersion &&
        r.confidenceScore !== undefined,
    );

    if (periodStart) {
      records = records.filter((r) => new Date(r.timestamp) >= periodStart);
    }
    if (periodEnd) {
      records = records.filter((r) => new Date(r.timestamp) <= periodEnd);
    }

    const scores = records.map((r) => r.confidenceScore!);
    const buckets = this.buildConfidenceBuckets(scores);
    const mean = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    const sorted = [...scores].sort((a, b) => a - b);
    const median = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0;
    const variance =
      scores.length > 0
        ? scores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / scores.length
        : 0;
    const stdDev = Math.sqrt(variance);

    const degraded = mean < CONFIDENCE_DEGRADATION_THRESHOLD && scores.length > 0;

    if (degraded) {
      this.emitAlert({
        type: 'degradation',
        modelName,
        modelVersion,
        message: `Confidence score degradation detected: mean=${mean.toFixed(3)}, threshold=${CONFIDENCE_DEGRADATION_THRESHOLD}`,
        timestamp: new Date().toISOString(),
        details: { mean, stdDev, sampleCount: scores.length },
      });
    }

    return {
      modelName,
      modelVersion,
      buckets,
      mean,
      median,
      stdDev,
      sampleCount: scores.length,
      degraded,
    };
  }

  private buildConfidenceBuckets(scores: number[]): ConfidenceBucket[] {
    const numBuckets = Math.round(1 / CONFIDENCE_BUCKET_SIZE);
    const buckets: ConfidenceBucket[] = [];
    for (let i = 0; i < numBuckets; i++) {
      const start = parseFloat((i * CONFIDENCE_BUCKET_SIZE).toFixed(1));
      const end = parseFloat(((i + 1) * CONFIDENCE_BUCKET_SIZE).toFixed(1));
      const isLast = i === numBuckets - 1;
      const count = scores.filter(
        (s) => s >= start && (isLast ? s <= end : s < end),
      ).length;
      buckets.push({
        rangeStart: start,
        rangeEnd: end,
        count,
        percentage: scores.length > 0 ? (count / scores.length) * 100 : 0,
      });
    }
    return buckets;
  }

  // ── Benchmark Evaluation (Req 30.3, 30.10) ─────────────────

  evaluateBenchmark(params: {
    modelName: string;
    modelVersion: string;
    datasetName: string;
    accuracy: number;
    sampleCount: number;
  }): BenchmarkResult {
    const result: BenchmarkResult = {
      modelName: params.modelName,
      modelVersion: params.modelVersion,
      datasetName: params.datasetName,
      accuracy: params.accuracy,
      evaluatedAt: new Date().toISOString(),
      sampleCount: params.sampleCount,
      belowThreshold: params.accuracy < ACCURACY_THRESHOLD,
    };

    this.benchmarkResults.push(result);

    this.logger.info('Benchmark evaluation completed', {
      modelName: result.modelName,
      modelVersion: result.modelVersion,
      accuracy: result.accuracy,
      belowThreshold: result.belowThreshold,
    });

    if (result.belowThreshold) {
      this.emitAlert({
        type: 'accuracy_drop',
        modelName: result.modelName,
        modelVersion: result.modelVersion,
        message: `Model accuracy ${(result.accuracy * 100).toFixed(1)}% is below ${ACCURACY_THRESHOLD * 100}% threshold on dataset "${result.datasetName}"`,
        timestamp: result.evaluatedAt,
        details: { accuracy: result.accuracy, dataset: result.datasetName, sampleCount: result.sampleCount },
      });
    }

    return result;
  }

  getBenchmarkResults(modelName?: string): BenchmarkResult[] {
    if (modelName) {
      return this.benchmarkResults.filter((r) => r.modelName === modelName);
    }
    return [...this.benchmarkResults];
  }

  // ── Cost Tracking (Req 30.4) ───────────────────────────────

  recordCost(params: {
    modelName: string;
    provider: string;
    tenantId?: string;
    costUsd: number;
    inputTokens: number;
    outputTokens: number;
  }): ModelCostRecord {
    const record: ModelCostRecord = {
      timestamp: new Date().toISOString(),
      ...params,
    };
    this.costRecords.push(record);
    return record;
  }

  getCostSummary(periodStart: Date, periodEnd: Date): CostSummary {
    const records = this.costRecords.filter(
      (r) =>
        new Date(r.timestamp) >= periodStart &&
        new Date(r.timestamp) <= periodEnd,
    );

    const byModel: Record<string, number> = {};
    const byTenant: Record<string, number> = {};
    let totalCostUsd = 0;

    for (const r of records) {
      totalCostUsd += r.costUsd;
      byModel[r.modelName] = (byModel[r.modelName] ?? 0) + r.costUsd;
      if (r.tenantId) {
        byTenant[r.tenantId] = (byTenant[r.tenantId] ?? 0) + r.costUsd;
      }
    }

    return { totalCostUsd, byModel, byTenant, periodStart, periodEnd };
  }

  // ── User Feedback / Flagging (Req 30.5) ────────────────────

  flagIncorrectResponse(params: {
    modelName: string;
    modelVersion: string;
    tenantId?: string;
    userId?: string;
    queryText?: string;
    responseText?: string;
    reason: string;
  }): UserFeedbackRecord {
    const record: UserFeedbackRecord = {
      id: `fb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      reviewed: false,
      ...params,
    };

    this.feedbackRecords.push(record);

    this.logger.warn('Incorrect AI response flagged', {
      modelName: record.modelName,
      modelVersion: record.modelVersion,
      feedbackId: record.id,
      tenantId: record.tenantId,
    });

    return record;
  }

  getUnreviewedFeedback(): UserFeedbackRecord[] {
    return this.feedbackRecords.filter((r) => !r.reviewed);
  }

  markFeedbackReviewed(feedbackId: string): boolean {
    const record = this.feedbackRecords.find((r) => r.id === feedbackId);
    if (!record) return false;
    record.reviewed = true;
    return true;
  }

  // ── Model Versioning (Req 30.6) ────────────────────────────

  registerModelVersion(params: {
    modelName: string;
    version: string;
    metadata?: Record<string, unknown>;
  }): ModelVersionEntry {
    const entry: ModelVersionEntry = {
      modelName: params.modelName,
      version: params.version,
      deployedAt: new Date().toISOString(),
      status: 'active',
      metadata: params.metadata,
    };

    const versions = this.modelVersions.get(params.modelName) ?? [];

    // Deactivate previous active versions
    for (const v of versions) {
      if (v.status === 'active') {
        v.status = 'inactive';
      }
    }

    versions.push(entry);
    this.modelVersions.set(params.modelName, versions);

    this.logger.info('Model version registered', {
      modelName: entry.modelName,
      version: entry.version,
    });

    return entry;
  }

  rollbackModel(modelName: string, targetVersion: string): ModelVersionEntry | undefined {
    const versions = this.modelVersions.get(modelName);
    if (!versions) return undefined;

    const target = versions.find((v) => v.version === targetVersion);
    if (!target) return undefined;

    // Deactivate all, activate target
    for (const v of versions) {
      v.status = v.version === targetVersion ? 'active' : 'inactive';
    }
    target.status = 'rollback';

    this.logger.warn('Model rollback executed', {
      modelName,
      targetVersion,
    });

    return target;
  }

  getActiveVersion(modelName: string): ModelVersionEntry | undefined {
    const versions = this.modelVersions.get(modelName) ?? [];
    return versions.find((v) => v.status === 'active' || v.status === 'rollback');
  }

  getModelVersions(modelName: string): ModelVersionEntry[] {
    return [...(this.modelVersions.get(modelName) ?? [])];
  }

  // ── A/B Testing (Req 30.7) ─────────────────────────────────

  createABTest(params: {
    modelName: string;
    controlVersion: string;
    treatmentVersion: string;
    trafficSplitPercent: number;
  }): ABTestConfig {
    const config: ABTestConfig = {
      id: `ab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      modelName: params.modelName,
      controlVersion: params.controlVersion,
      treatmentVersion: params.treatmentVersion,
      trafficSplitPercent: Math.max(0, Math.min(100, params.trafficSplitPercent)),
      startedAt: new Date().toISOString(),
      status: 'active',
    };

    this.abTests.set(config.id, config);

    this.logger.info('A/B test created', {
      testId: config.id,
      modelName: config.modelName,
      controlVersion: config.controlVersion,
      treatmentVersion: config.treatmentVersion,
      trafficSplitPercent: config.trafficSplitPercent,
    });

    return config;
  }

  /**
   * Resolve which model version to use for a given request based on active A/B tests.
   * Returns the treatment version for `trafficSplitPercent` of requests, control otherwise.
   */
  resolveABTestVersion(modelName: string): { version: string; testId?: string } | undefined {
    const activeTest = Array.from(this.abTests.values()).find(
      (t) => t.modelName === modelName && t.status === 'active',
    );

    if (!activeTest) return undefined;

    const useTreatment = Math.random() * 100 < activeTest.trafficSplitPercent;
    return {
      version: useTreatment ? activeTest.treatmentVersion : activeTest.controlVersion,
      testId: activeTest.id,
    };
  }

  completeABTest(testId: string): ABTestResult | undefined {
    const test = this.abTests.get(testId);
    if (!test || test.status !== 'active') return undefined;

    test.status = 'completed';
    test.endedAt = new Date().toISOString();

    const start = new Date(test.startedAt);
    const end = new Date(test.endedAt);

    const controlMetrics = this.getPerformanceMetrics(test.modelName, test.controlVersion, start, end);
    const treatmentMetrics = this.getPerformanceMetrics(test.modelName, test.treatmentVersion, start, end);
    const controlConfidence = this.getConfidenceDistribution(test.modelName, test.controlVersion, start, end);
    const treatmentConfidence = this.getConfidenceDistribution(test.modelName, test.treatmentVersion, start, end);

    return {
      testId,
      controlMetrics,
      treatmentMetrics,
      controlConfidence,
      treatmentConfidence,
    };
  }

  cancelABTest(testId: string): boolean {
    const test = this.abTests.get(testId);
    if (!test || test.status !== 'active') return false;
    test.status = 'cancelled';
    test.endedAt = new Date().toISOString();
    return true;
  }

  getABTests(modelName?: string): ABTestConfig[] {
    const tests = Array.from(this.abTests.values());
    if (modelName) return tests.filter((t) => t.modelName === modelName);
    return tests;
  }

  // ── Daily & Weekly Reports (Req 30.9) ──────────────────────

  generateDailyReport(date: Date): DailyPerformanceReport {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    // Collect unique model+version combos from the day's inferences
    const modelKeys = new Set<string>();
    for (const r of this.inferences) {
      const ts = new Date(r.timestamp);
      if (ts >= dayStart && ts <= dayEnd) {
        modelKeys.add(`${r.modelName}::${r.modelVersion}`);
      }
    }

    const models: ModelPerformanceMetrics[] = [];
    for (const key of modelKeys) {
      const [modelName, modelVersion] = key.split('::');
      models.push(this.getPerformanceMetrics(modelName, modelVersion, dayStart, dayEnd));
    }

    const costSummary = this.getCostSummary(dayStart, dayEnd);

    const degradationAlerts: string[] = [];
    for (const key of modelKeys) {
      const [modelName, modelVersion] = key.split('::');
      const dist = this.getConfidenceDistribution(modelName, modelVersion, dayStart, dayEnd);
      if (dist.degraded) {
        degradationAlerts.push(
          `${modelName}@${modelVersion}: mean confidence ${dist.mean.toFixed(3)} below threshold`,
        );
      }
    }

    return {
      date: dayStart.toISOString().slice(0, 10),
      models,
      costSummary,
      degradationAlerts,
    };
  }

  generateWeeklyReport(weekStart: Date): WeeklyReport {
    const dailyReports: DailyPerformanceReport[] = [];
    const current = new Date(weekStart);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    for (let i = 0; i < 7; i++) {
      const day = new Date(current);
      day.setDate(current.getDate() + i);
      dailyReports.push(this.generateDailyReport(day));
    }

    const overallCost = this.getCostSummary(weekStart, weekEnd);

    const benchmarkResults = this.benchmarkResults.filter((r) => {
      const evalDate = new Date(r.evaluatedAt);
      return evalDate >= weekStart && evalDate <= weekEnd;
    });

    const abTestResults: ABTestResult[] = [];
    for (const test of this.abTests.values()) {
      if (test.status === 'completed') {
        const testStart = new Date(test.startedAt);
        if (testStart >= weekStart && testStart <= weekEnd) {
          const result = this.getABTestResult(test);
          if (result) abTestResults.push(result);
        }
      }
    }

    const recommendations = this.generateRecommendations(dailyReports, benchmarkResults);

    return {
      weekStart: weekStart.toISOString().slice(0, 10),
      weekEnd: weekEnd.toISOString().slice(0, 10),
      dailyReports,
      overallCost,
      benchmarkResults,
      abTestResults,
      recommendations,
    };
  }

  private getABTestResult(test: ABTestConfig): ABTestResult | undefined {
    const start = new Date(test.startedAt);
    const end = test.endedAt ? new Date(test.endedAt) : new Date();

    return {
      testId: test.id,
      controlMetrics: this.getPerformanceMetrics(test.modelName, test.controlVersion, start, end),
      treatmentMetrics: this.getPerformanceMetrics(test.modelName, test.treatmentVersion, start, end),
      controlConfidence: this.getConfidenceDistribution(test.modelName, test.controlVersion, start, end),
      treatmentConfidence: this.getConfidenceDistribution(test.modelName, test.treatmentVersion, start, end),
    };
  }

  private generateRecommendations(
    dailyReports: DailyPerformanceReport[],
    benchmarks: BenchmarkResult[],
  ): string[] {
    const recommendations: string[] = [];

    // Check for persistent degradation
    const degradedDays = dailyReports.filter((r) => r.degradationAlerts.length > 0).length;
    if (degradedDays >= 3) {
      recommendations.push(
        `Model degradation detected on ${degradedDays}/7 days. Consider retraining or rolling back.`,
      );
    }

    // Check for benchmark failures
    const failedBenchmarks = benchmarks.filter((b) => b.belowThreshold);
    if (failedBenchmarks.length > 0) {
      recommendations.push(
        `${failedBenchmarks.length} benchmark(s) below ${ACCURACY_THRESHOLD * 100}% accuracy threshold. Investigate model performance.`,
      );
    }

    // Check for high error rates
    for (const report of dailyReports) {
      for (const model of report.models) {
        if (model.errorRate > 5) {
          recommendations.push(
            `${model.modelName}@${model.modelVersion} had ${model.errorRate.toFixed(1)}% error rate on ${report.date}. Review error logs.`,
          );
          break; // one recommendation per model is enough
        }
      }
    }

    return recommendations;
  }

  // ── Alert Emission ─────────────────────────────────────────

  private emitAlert(alert: MLOpsAlert): void {
    this.logger.warn(`MLOps alert: ${alert.type}`, {
      modelName: alert.modelName,
      modelVersion: alert.modelVersion,
      message: alert.message,
    });

    if (this.onAlert) {
      this.onAlert(alert);
    }
  }

  // ── Accessors ──────────────────────────────────────────────

  getInferences(): InferenceRecord[] {
    return [...this.inferences];
  }

  getCostRecords(): ModelCostRecord[] {
    return [...this.costRecords];
  }

  getFeedbackRecords(): UserFeedbackRecord[] {
    return [...this.feedbackRecords];
  }
}

// ── Helpers ─────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}
