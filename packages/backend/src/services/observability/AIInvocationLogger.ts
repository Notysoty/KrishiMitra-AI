/**
 * AI model invocation logging and cost tracking.
 * Logs model name, version, latency, token usage per invocation.
 * Tracks cumulative cost per provider with budget alerts.
 *
 * Requirements: 29.7, 29.8
 */

import {
  AIModelInvocationLog,
  AIProviderCostEntry,
  AIProviderCostSummary,
  BudgetAlertConfig,
} from '../../types/observability';
import { Logger } from './Logger';

/** Default cost per 1K tokens (USD) – configurable per provider/model */
export const DEFAULT_COST_PER_1K_TOKENS: Record<string, { input: number; output: number }> = {
  'gpt-4': { input: 0.03, output: 0.06 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'gpt-3.5-turbo': { input: 0.0005, output: 0.0015 },
  default: { input: 0.001, output: 0.002 },
};

export interface AIInvocationLoggerOptions {
  logger: Logger;
  budgetAlerts?: BudgetAlertConfig[];
  costTable?: Record<string, { input: number; output: number }>;
  /** Callback fired when a budget threshold is breached */
  onBudgetAlert?: (alert: { provider: string; currentCostUsd: number; budgetUsd: number; percent: number }) => void;
}

export class AIInvocationLogger {
  private logger: Logger;
  private invocations: AIModelInvocationLog[] = [];
  private costEntries: AIProviderCostEntry[] = [];
  private budgetAlerts: BudgetAlertConfig[];
  private costTable: Record<string, { input: number; output: number }>;
  private onBudgetAlert?: AIInvocationLoggerOptions['onBudgetAlert'];

  constructor(options: AIInvocationLoggerOptions) {
    this.logger = options.logger;
    this.budgetAlerts = options.budgetAlerts ?? [];
    this.costTable = options.costTable ?? DEFAULT_COST_PER_1K_TOKENS;
    this.onBudgetAlert = options.onBudgetAlert;
  }

  // ── Log an AI invocation ──────────────────────────────────

  logInvocation(params: {
    modelName: string;
    modelVersion: string;
    provider: string;
    latencyMs: number;
    inputTokens: number;
    outputTokens: number;
    tenantId?: string;
    userId?: string;
    traceId?: string;
    success: boolean;
    error?: string;
  }): AIModelInvocationLog {
    const entry: AIModelInvocationLog = {
      timestamp: new Date().toISOString(),
      traceId: params.traceId,
      modelName: params.modelName,
      modelVersion: params.modelVersion,
      provider: params.provider,
      latencyMs: params.latencyMs,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      totalTokens: params.inputTokens + params.outputTokens,
      tenantId: params.tenantId,
      userId: params.userId,
      success: params.success,
      error: params.error,
    };

    this.invocations.push(entry);

    // Structured log
    this.logger.info('AI model invocation', {
      modelName: entry.modelName,
      modelVersion: entry.modelVersion,
      provider: entry.provider,
      latencyMs: entry.latencyMs,
      inputTokens: entry.inputTokens,
      outputTokens: entry.outputTokens,
      totalTokens: entry.totalTokens,
      success: entry.success,
      tenantId: entry.tenantId,
      userId: entry.userId,
      traceId: entry.traceId,
    });

    // Track cost
    const costEntry = this.trackCost(entry);

    // Check budget alerts
    this.checkBudgetAlerts(costEntry.provider);

    return entry;
  }

  // ── Cost tracking ─────────────────────────────────────────

  private trackCost(invocation: AIModelInvocationLog): AIProviderCostEntry {
    const rates = this.costTable[invocation.modelName] ?? this.costTable['default'] ?? { input: 0.001, output: 0.002 };
    const costUsd =
      (invocation.inputTokens / 1000) * rates.input +
      (invocation.outputTokens / 1000) * rates.output;

    const entry: AIProviderCostEntry = {
      timestamp: invocation.timestamp,
      provider: invocation.provider,
      modelName: invocation.modelName,
      inputTokens: invocation.inputTokens,
      outputTokens: invocation.outputTokens,
      estimatedCostUsd: costUsd,
      tenantId: invocation.tenantId,
    };

    this.costEntries.push(entry);
    return entry;
  }

  // ── Budget alerts ─────────────────────────────────────────

  private checkBudgetAlerts(provider: string): void {
    const alertConfig = this.budgetAlerts.find((a) => a.provider === provider);
    if (!alertConfig) return;

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentCost = this.costEntries
      .filter((e) => e.provider === provider && new Date(e.timestamp) >= monthStart)
      .reduce((sum, e) => sum + e.estimatedCostUsd, 0);

    const percent = (currentCost / alertConfig.monthlyBudgetUsd) * 100;

    if (percent >= alertConfig.alertThresholdPercent) {
      this.logger.warn('AI provider budget alert', {
        provider,
        currentCostUsd: currentCost,
        budgetUsd: alertConfig.monthlyBudgetUsd,
        percent,
      });

      if (this.onBudgetAlert) {
        this.onBudgetAlert({
          provider,
          currentCostUsd: currentCost,
          budgetUsd: alertConfig.monthlyBudgetUsd,
          percent,
        });
      }
    }
  }

  // ── Summaries ─────────────────────────────────────────────

  getCostSummary(provider: string, periodStart: Date, periodEnd: Date): AIProviderCostSummary {
    const entries = this.costEntries.filter(
      (e) =>
        e.provider === provider &&
        new Date(e.timestamp) >= periodStart &&
        new Date(e.timestamp) <= periodEnd,
    );

    const byModel: Record<string, { costUsd: number; inputTokens: number; outputTokens: number }> = {};
    let totalCost = 0;
    let totalInput = 0;
    let totalOutput = 0;

    for (const e of entries) {
      totalCost += e.estimatedCostUsd;
      totalInput += e.inputTokens;
      totalOutput += e.outputTokens;

      if (!byModel[e.modelName]) {
        byModel[e.modelName] = { costUsd: 0, inputTokens: 0, outputTokens: 0 };
      }
      byModel[e.modelName].costUsd += e.estimatedCostUsd;
      byModel[e.modelName].inputTokens += e.inputTokens;
      byModel[e.modelName].outputTokens += e.outputTokens;
    }

    return {
      provider,
      totalCostUsd: totalCost,
      totalInputTokens: totalInput,
      totalOutputTokens: totalOutput,
      periodStart,
      periodEnd,
      byModel,
    };
  }

  getInvocations(): AIModelInvocationLog[] {
    return [...this.invocations];
  }

  getCostEntries(): AIProviderCostEntry[] {
    return [...this.costEntries];
  }
}
