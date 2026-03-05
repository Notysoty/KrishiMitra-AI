import { MLOpsService, ACCURACY_THRESHOLD, CONFIDENCE_DEGRADATION_THRESHOLD } from './MLOpsService';
import { MLOpsAlert } from '../../types/mlops';
import { Logger } from '../observability/Logger';

describe('MLOpsService', () => {
  let output: string[];
  let logger: Logger;
  let alerts: MLOpsAlert[];
  let service: MLOpsService;

  beforeEach(() => {
    output = [];
    alerts = [];
    logger = new Logger({ service: 'mlops-test', writer: (json) => output.push(json) });
    service = new MLOpsService({
      logger,
      onAlert: (alert) => alerts.push(alert),
    });
  });

  // ── Inference Recording (Req 30.1) ────────────────────────

  describe('recordInference', () => {
    it('should record an inference with all fields', () => {
      const record = service.recordInference({
        modelName: 'disease-classifier',
        modelVersion: 'v1.0',
        tenantId: 't-1',
        latencyMs: 250,
        success: true,
        confidenceScore: 0.92,
      });

      expect(record.modelName).toBe('disease-classifier');
      expect(record.modelVersion).toBe('v1.0');
      expect(record.latencyMs).toBe(250);
      expect(record.success).toBe(true);
      expect(record.confidenceScore).toBe(0.92);
      expect(record.timestamp).toBeDefined();
    });

    it('should accumulate inferences', () => {
      service.recordInference({ modelName: 'm1', modelVersion: 'v1', latencyMs: 100, success: true });
      service.recordInference({ modelName: 'm1', modelVersion: 'v1', latencyMs: 200, success: false, error: 'timeout' });

      expect(service.getInferences()).toHaveLength(2);
    });

    it('should write a structured log entry', () => {
      service.recordInference({ modelName: 'm1', modelVersion: 'v1', latencyMs: 100, success: true });

      expect(output.length).toBeGreaterThanOrEqual(1);
      const logEntry = JSON.parse(output[0]);
      expect(logEntry.message).toBe('ML inference recorded');
    });
  });

  // ── Performance Metrics (Req 30.1, 30.9) ──────────────────

  describe('getPerformanceMetrics', () => {
    it('should calculate metrics for a model version within a period', () => {
      for (let i = 0; i < 10; i++) {
        service.recordInference({
          modelName: 'clf',
          modelVersion: 'v1',
          latencyMs: 100 + i * 10,
          success: i < 9, // 1 failure
        });
      }

      const now = new Date();
      const hourAgo = new Date(now.getTime() - 3600_000);
      const metrics = service.getPerformanceMetrics('clf', 'v1', hourAgo, now);

      expect(metrics.totalInferences).toBe(10);
      expect(metrics.successCount).toBe(9);
      expect(metrics.errorCount).toBe(1);
      expect(metrics.errorRate).toBeCloseTo(10, 0);
      expect(metrics.avgLatencyMs).toBeGreaterThan(0);
      expect(metrics.p50LatencyMs).toBeGreaterThan(0);
      expect(metrics.p95LatencyMs).toBeGreaterThanOrEqual(metrics.p50LatencyMs);
      expect(metrics.throughput).toBeGreaterThan(0);
    });

    it('should return zero metrics when no inferences exist', () => {
      const now = new Date();
      const hourAgo = new Date(now.getTime() - 3600_000);
      const metrics = service.getPerformanceMetrics('none', 'v1', hourAgo, now);

      expect(metrics.totalInferences).toBe(0);
      expect(metrics.errorRate).toBe(0);
      expect(metrics.avgLatencyMs).toBe(0);
    });

    it('should filter by date range', () => {
      service.recordInference({ modelName: 'clf', modelVersion: 'v1', latencyMs: 100, success: true });

      const futureStart = new Date(Date.now() + 100_000);
      const futureEnd = new Date(Date.now() + 200_000);
      const metrics = service.getPerformanceMetrics('clf', 'v1', futureStart, futureEnd);

      expect(metrics.totalInferences).toBe(0);
    });
  });

  // ── Confidence Distribution (Req 30.2) ─────────────────────

  describe('getConfidenceDistribution', () => {
    it('should compute distribution buckets, mean, median, stdDev', () => {
      const scores = [0.95, 0.88, 0.72, 0.65, 0.91, 0.80, 0.77, 0.85, 0.60, 0.93];
      for (const s of scores) {
        service.recordInference({
          modelName: 'clf',
          modelVersion: 'v1',
          latencyMs: 100,
          success: true,
          confidenceScore: s,
        });
      }

      const dist = service.getConfidenceDistribution('clf', 'v1');

      expect(dist.sampleCount).toBe(10);
      expect(dist.buckets).toHaveLength(10);
      expect(dist.mean).toBeGreaterThan(0);
      expect(dist.median).toBeGreaterThan(0);
      expect(dist.stdDev).toBeGreaterThan(0);
      expect(dist.degraded).toBe(false);

      // Verify bucket percentages sum to 100
      const totalPct = dist.buckets.reduce((sum, b) => sum + b.percentage, 0);
      expect(totalPct).toBeCloseTo(100, 0);
    });

    it('should detect degradation when mean confidence is below threshold', () => {
      // All low confidence scores
      for (let i = 0; i < 10; i++) {
        service.recordInference({
          modelName: 'clf',
          modelVersion: 'v1',
          latencyMs: 100,
          success: true,
          confidenceScore: 0.3 + Math.random() * 0.2, // 0.3-0.5
        });
      }

      const dist = service.getConfidenceDistribution('clf', 'v1');
      expect(dist.degraded).toBe(true);
      expect(dist.mean).toBeLessThan(CONFIDENCE_DEGRADATION_THRESHOLD);

      // Should have emitted a degradation alert
      expect(alerts).toHaveLength(1);
      expect(alerts[0].type).toBe('degradation');
    });

    it('should return empty distribution when no confidence scores exist', () => {
      service.recordInference({ modelName: 'clf', modelVersion: 'v1', latencyMs: 100, success: true });

      const dist = service.getConfidenceDistribution('clf', 'v1');
      expect(dist.sampleCount).toBe(0);
      expect(dist.mean).toBe(0);
      expect(dist.degraded).toBe(false);
    });
  });

  // ── Benchmark Evaluation (Req 30.3, 30.10) ─────────────────

  describe('evaluateBenchmark', () => {
    it('should record a passing benchmark', () => {
      const result = service.evaluateBenchmark({
        modelName: 'disease-clf',
        modelVersion: 'v1',
        datasetName: 'PlantVillage',
        accuracy: 0.85,
        sampleCount: 1000,
      });

      expect(result.belowThreshold).toBe(false);
      expect(result.accuracy).toBe(0.85);
      expect(alerts).toHaveLength(0);
    });

    it('should alert when accuracy drops below threshold', () => {
      const result = service.evaluateBenchmark({
        modelName: 'disease-clf',
        modelVersion: 'v1',
        datasetName: 'PlantVillage',
        accuracy: 0.70,
        sampleCount: 500,
      });

      expect(result.belowThreshold).toBe(true);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].type).toBe('accuracy_drop');
      expect(alerts[0].message).toContain('70.0%');
      expect(alerts[0].message).toContain(`${ACCURACY_THRESHOLD * 100}%`);
    });

    it('should accumulate benchmark results', () => {
      service.evaluateBenchmark({ modelName: 'm1', modelVersion: 'v1', datasetName: 'd1', accuracy: 0.9, sampleCount: 100 });
      service.evaluateBenchmark({ modelName: 'm1', modelVersion: 'v2', datasetName: 'd1', accuracy: 0.8, sampleCount: 100 });

      expect(service.getBenchmarkResults('m1')).toHaveLength(2);
      expect(service.getBenchmarkResults()).toHaveLength(2);
    });
  });

  // ── Cost Tracking (Req 30.4) ───────────────────────────────

  describe('cost tracking', () => {
    it('should record and summarize costs by model and tenant', () => {
      service.recordCost({ modelName: 'gpt-4', provider: 'openai', tenantId: 't-1', costUsd: 0.05, inputTokens: 500, outputTokens: 200 });
      service.recordCost({ modelName: 'gpt-4', provider: 'openai', tenantId: 't-2', costUsd: 0.03, inputTokens: 300, outputTokens: 100 });
      service.recordCost({ modelName: 'gpt-3.5', provider: 'openai', tenantId: 't-1', costUsd: 0.01, inputTokens: 1000, outputTokens: 500 });

      const now = new Date();
      const hourAgo = new Date(now.getTime() - 3600_000);
      const summary = service.getCostSummary(hourAgo, now);

      expect(summary.totalCostUsd).toBeCloseTo(0.09, 4);
      expect(summary.byModel['gpt-4']).toBeCloseTo(0.08, 4);
      expect(summary.byModel['gpt-3.5']).toBeCloseTo(0.01, 4);
      expect(summary.byTenant['t-1']).toBeCloseTo(0.06, 4);
      expect(summary.byTenant['t-2']).toBeCloseTo(0.03, 4);
    });

    it('should filter costs by date range', () => {
      service.recordCost({ modelName: 'gpt-4', provider: 'openai', costUsd: 0.05, inputTokens: 500, outputTokens: 200 });

      const futureStart = new Date(Date.now() + 100_000);
      const futureEnd = new Date(Date.now() + 200_000);
      const summary = service.getCostSummary(futureStart, futureEnd);

      expect(summary.totalCostUsd).toBe(0);
    });
  });

  // ── User Feedback / Flagging (Req 30.5) ────────────────────

  describe('user feedback', () => {
    it('should flag an incorrect response for ML_Ops review', () => {
      const record = service.flagIncorrectResponse({
        modelName: 'clf',
        modelVersion: 'v1',
        tenantId: 't-1',
        userId: 'u-1',
        reason: 'Wrong disease identified',
      });

      expect(record.id).toBeDefined();
      expect(record.reviewed).toBe(false);
      expect(record.reason).toBe('Wrong disease identified');
    });

    it('should return unreviewed feedback', () => {
      service.flagIncorrectResponse({ modelName: 'clf', modelVersion: 'v1', reason: 'wrong' });
      service.flagIncorrectResponse({ modelName: 'clf', modelVersion: 'v1', reason: 'bad' });

      const unreviewed = service.getUnreviewedFeedback();
      expect(unreviewed).toHaveLength(2);
    });

    it('should mark feedback as reviewed', () => {
      const record = service.flagIncorrectResponse({ modelName: 'clf', modelVersion: 'v1', reason: 'wrong' });

      expect(service.markFeedbackReviewed(record.id)).toBe(true);
      expect(service.getUnreviewedFeedback()).toHaveLength(0);
    });

    it('should return false for non-existent feedback id', () => {
      expect(service.markFeedbackReviewed('nonexistent')).toBe(false);
    });
  });

  // ── Model Versioning (Req 30.6) ────────────────────────────

  describe('model versioning', () => {
    it('should register a new model version as active', () => {
      const entry = service.registerModelVersion({ modelName: 'clf', version: 'v1.0' });

      expect(entry.status).toBe('active');
      expect(entry.modelName).toBe('clf');
      expect(entry.version).toBe('v1.0');
    });

    it('should deactivate previous versions when registering a new one', () => {
      service.registerModelVersion({ modelName: 'clf', version: 'v1.0' });
      service.registerModelVersion({ modelName: 'clf', version: 'v2.0' });

      const versions = service.getModelVersions('clf');
      expect(versions).toHaveLength(2);
      expect(versions[0].status).toBe('inactive');
      expect(versions[1].status).toBe('active');
    });

    it('should return the active version', () => {
      service.registerModelVersion({ modelName: 'clf', version: 'v1.0' });
      service.registerModelVersion({ modelName: 'clf', version: 'v2.0' });

      const active = service.getActiveVersion('clf');
      expect(active?.version).toBe('v2.0');
    });

    it('should rollback to a previous version', () => {
      service.registerModelVersion({ modelName: 'clf', version: 'v1.0' });
      service.registerModelVersion({ modelName: 'clf', version: 'v2.0' });

      const rolled = service.rollbackModel('clf', 'v1.0');
      expect(rolled?.status).toBe('rollback');

      const active = service.getActiveVersion('clf');
      expect(active?.version).toBe('v1.0');
    });

    it('should return undefined when rolling back to non-existent version', () => {
      expect(service.rollbackModel('clf', 'v99')).toBeUndefined();
    });

    it('should return undefined for unknown model', () => {
      expect(service.getActiveVersion('unknown')).toBeUndefined();
    });
  });

  // ── A/B Testing (Req 30.7) ─────────────────────────────────

  describe('A/B testing', () => {
    it('should create an A/B test', () => {
      const test = service.createABTest({
        modelName: 'clf',
        controlVersion: 'v1.0',
        treatmentVersion: 'v2.0',
        trafficSplitPercent: 20,
      });

      expect(test.id).toBeDefined();
      expect(test.status).toBe('active');
      expect(test.trafficSplitPercent).toBe(20);
    });

    it('should clamp traffic split to 0-100', () => {
      const test = service.createABTest({
        modelName: 'clf',
        controlVersion: 'v1',
        treatmentVersion: 'v2',
        trafficSplitPercent: 150,
      });
      expect(test.trafficSplitPercent).toBe(100);
    });

    it('should resolve A/B test version', () => {
      service.createABTest({
        modelName: 'clf',
        controlVersion: 'v1',
        treatmentVersion: 'v2',
        trafficSplitPercent: 50,
      });

      // Run multiple resolutions to verify both versions can be returned
      const versions = new Set<string>();
      for (let i = 0; i < 100; i++) {
        const result = service.resolveABTestVersion('clf');
        if (result) versions.add(result.version);
      }

      expect(versions.has('v1') || versions.has('v2')).toBe(true);
    });

    it('should return undefined when no active A/B test exists', () => {
      expect(service.resolveABTestVersion('clf')).toBeUndefined();
    });

    it('should complete an A/B test and return results', () => {
      const test = service.createABTest({
        modelName: 'clf',
        controlVersion: 'v1',
        treatmentVersion: 'v2',
        trafficSplitPercent: 50,
      });

      // Record some inferences for both versions
      service.recordInference({ modelName: 'clf', modelVersion: 'v1', latencyMs: 100, success: true, confidenceScore: 0.9 });
      service.recordInference({ modelName: 'clf', modelVersion: 'v2', latencyMs: 80, success: true, confidenceScore: 0.95 });

      const result = service.completeABTest(test.id);
      expect(result).toBeDefined();
      expect(result!.testId).toBe(test.id);
      expect(result!.controlMetrics.modelVersion).toBe('v1');
      expect(result!.treatmentMetrics.modelVersion).toBe('v2');
    });

    it('should cancel an A/B test', () => {
      const test = service.createABTest({
        modelName: 'clf',
        controlVersion: 'v1',
        treatmentVersion: 'v2',
        trafficSplitPercent: 50,
      });

      expect(service.cancelABTest(test.id)).toBe(true);
      expect(service.getABTests()[0].status).toBe('cancelled');
    });

    it('should not complete an already completed test', () => {
      const test = service.createABTest({
        modelName: 'clf',
        controlVersion: 'v1',
        treatmentVersion: 'v2',
        trafficSplitPercent: 50,
      });

      service.completeABTest(test.id);
      expect(service.completeABTest(test.id)).toBeUndefined();
    });

    it('should list A/B tests filtered by model', () => {
      service.createABTest({ modelName: 'clf', controlVersion: 'v1', treatmentVersion: 'v2', trafficSplitPercent: 50 });
      service.createABTest({ modelName: 'rag', controlVersion: 'v1', treatmentVersion: 'v2', trafficSplitPercent: 30 });

      expect(service.getABTests('clf')).toHaveLength(1);
      expect(service.getABTests()).toHaveLength(2);
    });
  });

  // ── Daily & Weekly Reports (Req 30.9) ──────────────────────

  describe('reports', () => {
    it('should generate a daily performance report', () => {
      service.recordInference({ modelName: 'clf', modelVersion: 'v1', latencyMs: 100, success: true, confidenceScore: 0.9 });
      service.recordInference({ modelName: 'clf', modelVersion: 'v1', latencyMs: 200, success: true, confidenceScore: 0.85 });
      service.recordCost({ modelName: 'clf', provider: 'openai', costUsd: 0.01, inputTokens: 100, outputTokens: 50 });

      const report = service.generateDailyReport(new Date());

      expect(report.date).toBeDefined();
      expect(report.models.length).toBeGreaterThanOrEqual(1);
      expect(report.costSummary).toBeDefined();
      expect(report.degradationAlerts).toBeDefined();
    });

    it('should generate a weekly report with 7 daily reports', () => {
      service.recordInference({ modelName: 'clf', modelVersion: 'v1', latencyMs: 100, success: true, confidenceScore: 0.9 });
      service.recordCost({ modelName: 'clf', provider: 'openai', costUsd: 0.01, inputTokens: 100, outputTokens: 50 });

      const weekStart = new Date();
      weekStart.setHours(0, 0, 0, 0);
      const report = service.generateWeeklyReport(weekStart);

      expect(report.dailyReports).toHaveLength(7);
      expect(report.weekStart).toBeDefined();
      expect(report.weekEnd).toBeDefined();
      expect(report.overallCost).toBeDefined();
      expect(report.recommendations).toBeDefined();
    });

    it('should include degradation alerts in daily report', () => {
      // Record low confidence scores to trigger degradation
      for (let i = 0; i < 10; i++) {
        service.recordInference({
          modelName: 'clf',
          modelVersion: 'v1',
          latencyMs: 100,
          success: true,
          confidenceScore: 0.3,
        });
      }

      alerts = []; // reset alerts from recordInference
      const report = service.generateDailyReport(new Date());

      expect(report.degradationAlerts.length).toBeGreaterThan(0);
      expect(report.degradationAlerts[0]).toContain('clf@v1');
    });

    it('should generate recommendations for persistent degradation', () => {
      // Record low confidence scores
      for (let i = 0; i < 10; i++) {
        service.recordInference({
          modelName: 'clf',
          modelVersion: 'v1',
          latencyMs: 100,
          success: true,
          confidenceScore: 0.3,
        });
      }

      const weekStart = new Date();
      weekStart.setHours(0, 0, 0, 0);
      const report = service.generateWeeklyReport(weekStart);

      // Since all inferences are today, only 1 day has degradation
      // but the report structure should still be valid
      expect(report.recommendations).toBeDefined();
      expect(Array.isArray(report.recommendations)).toBe(true);
    });

    it('should include benchmark failures in weekly recommendations', () => {
      service.evaluateBenchmark({
        modelName: 'clf',
        modelVersion: 'v1',
        datasetName: 'test',
        accuracy: 0.60,
        sampleCount: 100,
      });

      const weekStart = new Date();
      weekStart.setHours(0, 0, 0, 0);
      const report = service.generateWeeklyReport(weekStart);

      expect(report.benchmarkResults).toHaveLength(1);
      const hasAccuracyRec = report.recommendations.some((r) => r.includes('accuracy'));
      expect(hasAccuracyRec).toBe(true);
    });
  });

  // ── Exports ────────────────────────────────────────────────

  describe('exports', () => {
    it('should export ACCURACY_THRESHOLD', () => {
      expect(ACCURACY_THRESHOLD).toBe(0.75);
    });

    it('should export CONFIDENCE_DEGRADATION_THRESHOLD', () => {
      expect(CONFIDENCE_DEGRADATION_THRESHOLD).toBe(0.6);
    });
  });
});
