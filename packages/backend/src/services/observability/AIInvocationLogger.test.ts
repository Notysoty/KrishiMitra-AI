import { AIInvocationLogger, DEFAULT_COST_PER_1K_TOKENS } from './AIInvocationLogger';
import { Logger } from './Logger';

describe('AIInvocationLogger', () => {
  let output: string[];
  let logger: Logger;

  beforeEach(() => {
    output = [];
    logger = new Logger({ service: 'ai-test', writer: (json) => output.push(json) });
  });

  function createAILogger(overrides: Partial<ConstructorParameters<typeof AIInvocationLogger>[0]> = {}) {
    return new AIInvocationLogger({ logger, ...overrides });
  }

  const baseInvocation = {
    modelName: 'gpt-4',
    modelVersion: '0613',
    provider: 'openai',
    latencyMs: 1200,
    inputTokens: 500,
    outputTokens: 200,
    tenantId: 't-1',
    userId: 'u-1',
    traceId: 'trace-1',
    success: true,
  };

  // ── Invocation logging ────────────────────────────────────

  describe('logInvocation', () => {
    it('should log an AI invocation with all fields', () => {
      const aiLogger = createAILogger();
      const entry = aiLogger.logInvocation(baseInvocation);

      expect(entry.modelName).toBe('gpt-4');
      expect(entry.modelVersion).toBe('0613');
      expect(entry.provider).toBe('openai');
      expect(entry.latencyMs).toBe(1200);
      expect(entry.inputTokens).toBe(500);
      expect(entry.outputTokens).toBe(200);
      expect(entry.totalTokens).toBe(700);
      expect(entry.success).toBe(true);
      expect(entry.timestamp).toBeDefined();
    });

    it('should write a structured log entry', () => {
      const aiLogger = createAILogger();
      aiLogger.logInvocation(baseInvocation);

      // Logger should have been called (output has entries)
      expect(output.length).toBeGreaterThanOrEqual(1);
      const logEntry = JSON.parse(output[0]);
      expect(logEntry.message).toBe('AI model invocation');
      expect(logEntry.metadata.modelName).toBe('gpt-4');
    });

    it('should log failed invocations', () => {
      const aiLogger = createAILogger();
      const entry = aiLogger.logInvocation({
        ...baseInvocation,
        success: false,
        error: 'Rate limit exceeded',
      });

      expect(entry.success).toBe(false);
      expect(entry.error).toBe('Rate limit exceeded');
    });

    it('should accumulate invocations', () => {
      const aiLogger = createAILogger();
      aiLogger.logInvocation(baseInvocation);
      aiLogger.logInvocation({ ...baseInvocation, modelName: 'gpt-3.5-turbo' });

      expect(aiLogger.getInvocations()).toHaveLength(2);
    });
  });

  // ── Cost tracking ─────────────────────────────────────────

  describe('cost tracking', () => {
    it('should calculate cost based on token usage and model rates', () => {
      const aiLogger = createAILogger();
      aiLogger.logInvocation(baseInvocation);

      const entries = aiLogger.getCostEntries();
      expect(entries).toHaveLength(1);

      // gpt-4: input $0.03/1K, output $0.06/1K
      // 500 input tokens = 0.5 * 0.03 = 0.015
      // 200 output tokens = 0.2 * 0.06 = 0.012
      // total = 0.027
      expect(entries[0].estimatedCostUsd).toBeCloseTo(0.027, 4);
    });

    it('should use default rates for unknown models', () => {
      const aiLogger = createAILogger();
      aiLogger.logInvocation({ ...baseInvocation, modelName: 'custom-model' });

      const entries = aiLogger.getCostEntries();
      // default: input $0.001/1K, output $0.002/1K
      // 500 * 0.001/1000 + 200 * 0.002/1000 = 0.0005 + 0.0004 = 0.0009
      expect(entries[0].estimatedCostUsd).toBeCloseTo(0.0009, 5);
    });

    it('should use custom cost table when provided', () => {
      const aiLogger = createAILogger({
        costTable: { 'gpt-4': { input: 0.01, output: 0.02 }, default: { input: 0.001, output: 0.002 } },
      });
      aiLogger.logInvocation(baseInvocation);

      const entries = aiLogger.getCostEntries();
      // 500 * 0.01/1000 + 200 * 0.02/1000 = 0.005 + 0.004 = 0.009
      expect(entries[0].estimatedCostUsd).toBeCloseTo(0.009, 5);
    });
  });

  // ── Cost summary ──────────────────────────────────────────

  describe('getCostSummary', () => {
    it('should aggregate costs by provider and model', () => {
      const aiLogger = createAILogger();
      aiLogger.logInvocation(baseInvocation);
      aiLogger.logInvocation({ ...baseInvocation, modelName: 'gpt-3.5-turbo', inputTokens: 1000, outputTokens: 500 });

      const now = new Date();
      const hourAgo = new Date(now.getTime() - 3600_000);
      const summary = aiLogger.getCostSummary('openai', hourAgo, now);

      expect(summary.provider).toBe('openai');
      expect(summary.totalInputTokens).toBe(1500);
      expect(summary.totalOutputTokens).toBe(700);
      expect(summary.totalCostUsd).toBeGreaterThan(0);
      expect(Object.keys(summary.byModel)).toHaveLength(2);
      expect(summary.byModel['gpt-4']).toBeDefined();
      expect(summary.byModel['gpt-3.5-turbo']).toBeDefined();
    });

    it('should filter by date range', () => {
      const aiLogger = createAILogger();
      aiLogger.logInvocation(baseInvocation);

      const futureStart = new Date(Date.now() + 100_000);
      const futureEnd = new Date(Date.now() + 200_000);
      const summary = aiLogger.getCostSummary('openai', futureStart, futureEnd);

      expect(summary.totalCostUsd).toBe(0);
      expect(summary.totalInputTokens).toBe(0);
    });
  });

  // ── Budget alerts ─────────────────────────────────────────

  describe('budget alerts', () => {
    it('should fire budget alert callback when threshold is breached', () => {
      const alertFn = jest.fn();
      const aiLogger = createAILogger({
        budgetAlerts: [{ provider: 'openai', monthlyBudgetUsd: 0.01, alertThresholdPercent: 50 }],
        onBudgetAlert: alertFn,
      });

      // This invocation costs ~$0.027 which exceeds $0.01 budget
      aiLogger.logInvocation(baseInvocation);

      expect(alertFn).toHaveBeenCalledTimes(1);
      expect(alertFn.mock.calls[0][0].provider).toBe('openai');
      expect(alertFn.mock.calls[0][0].percent).toBeGreaterThan(50);
    });

    it('should not fire alert when below threshold', () => {
      const alertFn = jest.fn();
      const aiLogger = createAILogger({
        budgetAlerts: [{ provider: 'openai', monthlyBudgetUsd: 1000, alertThresholdPercent: 80 }],
        onBudgetAlert: alertFn,
      });

      aiLogger.logInvocation(baseInvocation);
      expect(alertFn).not.toHaveBeenCalled();
    });

    it('should log a warning when budget alert fires', () => {
      const aiLogger = createAILogger({
        budgetAlerts: [{ provider: 'openai', monthlyBudgetUsd: 0.01, alertThresholdPercent: 50 }],
      });

      aiLogger.logInvocation(baseInvocation);

      // Should have at least 2 log entries: invocation + budget warning
      expect(output.length).toBeGreaterThanOrEqual(2);
      const warnEntry = output.find((o) => JSON.parse(o).level === 'warn');
      expect(warnEntry).toBeDefined();
      expect(JSON.parse(warnEntry!).message).toBe('AI provider budget alert');
    });
  });

  // ── Default cost table ────────────────────────────────────

  it('should export default cost table', () => {
    expect(DEFAULT_COST_PER_1K_TOKENS['gpt-4']).toBeDefined();
    expect(DEFAULT_COST_PER_1K_TOKENS['gpt-3.5-turbo']).toBeDefined();
    expect(DEFAULT_COST_PER_1K_TOKENS['default']).toBeDefined();
  });
});
