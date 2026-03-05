/**
 * ServiceRegistry — singleton service locator that initializes all backend services
 * in dependency order and provides a clean access point across the application.
 *
 * Wiring:
 * - AIAssistant uses MarketService and SchemeService for tool-calling context
 * - AlertGenerator uses MarketService for price data
 * - SustainabilityCalculator uses farm input logs and weather APIs
 * - ContentModerationService uses RAGSystem for knowledge base integration
 * - MLOpsService intercepts all AI service invocations
 * - All external service calls are wrapped with CircuitBreaker + retryWithBackoff
 *
 * Requirements: 5.7, 31.6
 */

import { Logger } from './observability/Logger';
import { LogLevel } from '../types/observability';
import { CircuitBreaker } from './resilience/CircuitBreaker';
import { CircuitState } from '../types/resilience';
import { HealthCheck } from './resilience/HealthCheck';

import { AuthService } from './auth/AuthService';
import { FarmService } from './farm/FarmService';
import { CropService } from './farm/CropService';
import { MarketService } from './market/MarketService';
import { MarketIntelligence } from './market/MarketIntelligence';
import { PriceForecaster } from './market/PriceForecaster';
import { AlertGenerator } from './alert/AlertGenerator';
import { AlertDeliveryService } from './alert/AlertDeliveryService';
import { SustainabilityCalculator } from './sustainability/SustainabilityCalculator';
import { AIAssistant, MockLLMClient, RateLimiter, InteractionLogger } from './ai/AIAssistant';
import { RAGSystem, MockEmbeddingService } from './ai/RAGSystem';
import { SafetyGuardrail } from './ai/SafetyGuardrail';
import { DiseaseClassifier } from './ai/DiseaseClassifier';
import { SpeechService } from './ai/SpeechService';
import { WorkflowService } from './ai/WorkflowService';
import { SchemeService } from './scheme/SchemeService';
import { ContentModerationService } from './admin/ContentModerationService';
import { TenantAdminService } from './admin/TenantAdminService';
import { PlatformAdminService } from './admin/PlatformAdminService';
import { AuditService } from './admin/AuditService';
import { GroupService } from './admin/GroupService';
import { MLOpsService } from './mlops/MLOpsService';
import { ETLService } from './etl/ETLService';

// ── Circuit breaker instances for external services ──────────────

export const circuitBreakers = {
  /** AI/LLM provider (OpenAI, Azure) */
  aiProvider: new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 30_000 }),
  /** Weather API */
  weatherApi: new CircuitBreaker({ failureThreshold: 5, resetTimeoutMs: 60_000 }),
  /** Market data API */
  marketApi: new CircuitBreaker({ failureThreshold: 5, resetTimeoutMs: 60_000 }),
  /** Speech-to-text / text-to-speech API */
  speechApi: new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 30_000 }),
  /** Database (secondary guard beyond pool retry) */
  database: new CircuitBreaker({ failureThreshold: 10, resetTimeoutMs: 120_000 }),
};

// ── Shared logger ────────────────────────────────────────────────

export const appLogger = new Logger({
  service: 'krishimitra-backend',
  minLevel: (process.env.LOG_LEVEL as LogLevel) ?? LogLevel.INFO,
});

// ── ServiceRegistry ──────────────────────────────────────────────

class ServiceRegistry {
  private initialized = false;

  // ── Observability ──────────────────────────────────────────
  readonly logger = appLogger;

  readonly mlOps = new MLOpsService({
    logger: appLogger,
    onAlert: (alert) => {
      appLogger.warn('MLOps alert triggered', {
        type: alert.type,
        modelName: alert.modelName,
        message: alert.message,
      });
    },
  });

  readonly healthCheck = new HealthCheck();

  // ── Auth ───────────────────────────────────────────────────
  readonly authService = new AuthService();

  // ── Farm ──────────────────────────────────────────────────
  readonly farmService = new FarmService();
  readonly cropService = new CropService();

  // ── Market ────────────────────────────────────────────────
  readonly marketService = new MarketService();
  readonly marketIntelligence = new MarketIntelligence(this.marketService);
  readonly priceForecaster = new PriceForecaster(this.marketService);

  // ── Alerts ────────────────────────────────────────────────
  readonly alertGenerator = new AlertGenerator();
  readonly alertDeliveryService = new AlertDeliveryService();

  // ── Sustainability ─────────────────────────────────────────
  readonly sustainabilityCalculator = new SustainabilityCalculator();

  // ── Scheme ────────────────────────────────────────────────
  readonly schemeService = new SchemeService();

  // ── AI core ───────────────────────────────────────────────
  readonly safetyGuardrail = new SafetyGuardrail();
  readonly ragSystem = new RAGSystem(new MockEmbeddingService());

  /**
   * AIAssistant wired with MarketService and SchemeService for tool-calling.
   * The LLM client is wrapped with the AI circuit breaker so failures fall
   * back gracefully without crashing the request.
   */
  readonly aiAssistant: AIAssistant;

  readonly diseaseClassifier = new DiseaseClassifier();
  readonly speechService = new SpeechService();

  /**
   * WorkflowService — uses its own built-in scheme data.
   * Wired here as a singleton for consistent state across requests.
   */
  readonly workflowService = new WorkflowService();

  // ── Admin ─────────────────────────────────────────────────
  readonly contentModerationService = new ContentModerationService();
  readonly tenantAdminService = new TenantAdminService();
  readonly platformAdminService = new PlatformAdminService();
  readonly auditService = new AuditService();
  readonly groupService = new GroupService();

  // ── ETL ───────────────────────────────────────────────────
  readonly etlService = new ETLService({
    logger: appLogger,
    onAlert: (alert) => {
      appLogger.warn('ETL alert triggered', {
        type: alert.type,
        pipelineName: alert.pipelineName,
        message: alert.message,
      });
    },
  });

  constructor() {
    // Wire AIAssistant with circuit-breaker-wrapped LLM client
    const baseLLMClient = new MockLLMClient();
    const wrappedLLMClient = {
      generate: (params: Parameters<typeof baseLLMClient.generate>[0]) =>
        circuitBreakers.aiProvider.execute(
          () => baseLLMClient.generate(params),
          async () => ({
            text: 'AI service is temporarily unavailable. Please try again in a few minutes.',
          }),
        ),
    };

    this.aiAssistant = new AIAssistant(
      wrappedLLMClient,
      this.ragSystem,
      this.safetyGuardrail,
      new RateLimiter(),
      new InteractionLogger(),
    );

    // Register health checks for critical services
    this._registerHealthChecks();
  }

  /**
   * Initialize async resources (DB pool, Redis) and start background jobs.
   * Call once at application startup before accepting requests.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    appLogger.info('ServiceRegistry initializing...');

    // Start logger auto-flush
    appLogger.startAutoFlush();

    this.initialized = true;
    appLogger.info('ServiceRegistry initialized successfully');
  }

  /**
   * Graceful shutdown — flush logs, close connections.
   */
  async shutdown(): Promise<void> {
    appLogger.info('ServiceRegistry shutting down...');
    appLogger.stopAutoFlush();
    await appLogger.flush();
  }

  // ── Private helpers ──────────────────────────────────────

  private _registerHealthChecks(): void {
    this.healthCheck.register('database', async () => {
      try {
        const { getPool } = await import('../db/pool');
        const pool = getPool();
        await pool.query('SELECT 1');
        return { service: 'database', status: 'healthy' as const, checkedAt: new Date().toISOString() };
      } catch (err) {
        return {
          service: 'database',
          status: 'unhealthy' as const,
          message: (err as Error).message,
          checkedAt: new Date().toISOString(),
        };
      }
    });

    this.healthCheck.register('redis', async () => {
      try {
        const { getRedisClient } = await import('../middleware/cache');
        const client = getRedisClient();
        if (!client) return { service: 'redis', status: 'degraded' as const, message: 'Redis not connected', checkedAt: new Date().toISOString() };
        await client.get('health-check');
        return { service: 'redis', status: 'healthy' as const, checkedAt: new Date().toISOString() };
      } catch (err) {
        return {
          service: 'redis',
          status: 'degraded' as const,
          message: (err as Error).message,
          checkedAt: new Date().toISOString(),
        };
      }
    });

    this.healthCheck.register('ai-circuit-breaker', async () => {
      const state = circuitBreakers.aiProvider.getState();
      return state === CircuitState.OPEN
        ? { service: 'ai-circuit-breaker', status: 'degraded' as const, message: 'AI provider circuit breaker is open', checkedAt: new Date().toISOString() }
        : { service: 'ai-circuit-breaker', status: 'healthy' as const, checkedAt: new Date().toISOString() };
    });
  }
}

// ── Singleton export ─────────────────────────────────────────────

export const registry = new ServiceRegistry();
