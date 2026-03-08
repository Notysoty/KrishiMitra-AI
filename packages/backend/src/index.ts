/**
 * KrishiMitra-AI Backend — main application entry point.
 *
 * Wires all backend services through the ServiceRegistry and registers
 * all routes with proper middleware (auth, RBAC, rate limiting, caching).
 *
 * Service wiring:
 * - AIAssistant → circuit-breaker-wrapped LLM client (via ServiceRegistry)
 * - AlertGenerator → MarketService price data pipelines
 * - SustainabilityCalculator → farm input logs + weather APIs
 * - ContentModerationService → RAGSystem / knowledge base
 * - MLOpsService → intercepts all AI service invocations
 * - All external calls → CircuitBreaker + retryWithBackoff (via ServiceRegistry)
 *
 * Requirements: 5.7, 31.6
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';

// ── Middleware ────────────────────────────────────────────────
import { tenantRateLimit } from './middleware/rateLimiter';
import { marketDataCache } from './middleware/cache';
import { authenticate } from './middleware/authenticate';

// ── Routes ────────────────────────────────────────────────────
import authRoutes from './routes/auth';
import farmRoutes from './routes/farms';
import aiRoutes from './routes/ai';
import diseaseRoutes from './routes/disease';
import marketRoutes from './routes/markets';
import alertRoutes from './routes/alerts';
import sustainabilityRoutes from './routes/sustainability';
import adminRoutes from './routes/admin';
import platformAdminRoutes from './routes/platform-admin';
import speechRoutes from './routes/speech';
import schemeRoutes from './routes/schemes';
import auditRoutes from './routes/audit';
import moderationRoutes from './routes/moderation';
import groupRoutes from './routes/groups';
import healthRoutes, { healthCheck } from './routes/health';

// ── Service Registry (initializes all services in dependency order) ──
import { registry, circuitBreakers, appLogger } from './services/ServiceRegistry';
import { CircuitState } from './types/resilience';

// ── DB pool init ──────────────────────────────────────────────
import { initPool } from './db/pool';
import { initRedisClient } from './middleware/cache';
import { loadSecrets } from './config/secrets';

// ── App setup ─────────────────────────────────────────────────

const app = express();

// Security headers
app.use(helmet());

// CORS
app.use(cors());

// Response compression
app.use(compression());

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.raw({ type: 'audio/*', limit: '10mb' }));

// ── Global rate limiting (per-tenant) ─────────────────────────
// Applied after auth so tenant_id is available; auth routes are excluded.
app.use('/api/v1', (req, res, next) => {
  // Skip rate limiting for auth routes (login/register don't have a tenant yet)
  if (req.path.startsWith('/auth')) return next();
  return tenantRateLimit()(req, res, next);
});

// ── Health check (no auth required) ──────────────────────────
app.use('/api/v1/health', healthRoutes);

// Legacy health endpoint kept for backwards compatibility
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Auth routes ───────────────────────────────────────────────
app.use('/api/v1/auth', authRoutes);

// ── Farm routes ───────────────────────────────────────────────
app.use('/api/v1/farms', farmRoutes);

// ── AI routes (with per-user AI rate limiting applied inside route) ──
app.use('/api/v1/ai', aiRoutes);
app.use('/api/v1/ai', speechRoutes);

// ── Disease classification routes ─────────────────────────────
app.use('/api/v1/disease', diseaseRoutes);

// ── Market routes (with Redis caching for GET endpoints) ──────
app.use('/api/v1/markets', marketDataCache, marketRoutes);

// ── Alert routes ──────────────────────────────────────────────
app.use('/api/v1/alerts', alertRoutes);

// ── Sustainability routes ─────────────────────────────────────
app.use('/api/v1/sustainability', sustainabilityRoutes);

// ── Scheme routes ─────────────────────────────────────────────
app.use('/api/v1/schemes', schemeRoutes);

// ── Admin routes ──────────────────────────────────────────────
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/platform', platformAdminRoutes);

// ── Audit routes ──────────────────────────────────────────────
app.use('/api/v1/audit', auditRoutes);

// ── Content moderation routes ─────────────────────────────────
app.use('/api/v1/moderation', moderationRoutes);

// ── Field officer group routes ────────────────────────────────
app.use('/api/v1/groups', groupRoutes);

// ── Global error handler ──────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  appLogger.error('Unhandled error', err);
  res.status(500).json({
    error: 'An unexpected error occurred. Please try again later.',
  });
});

// ── Startup ───────────────────────────────────────────────────

async function startServer(): Promise<void> {
  try {
    // 0. Load secrets from AWS Secrets Manager (no-op if AUTH_SECRET_NAME not set)
    await loadSecrets();
    appLogger.info('Secrets loaded');

    // 1. Initialize database pool
    await initPool();
    appLogger.info('Database pool initialized');

    // 2. Initialize Redis (optional — app degrades gracefully without it)
    if (process.env.REDIS_URL) {
      try {
        await initRedisClient();
        appLogger.info('Redis client initialized');
      } catch (err) {
        appLogger.warn('Redis unavailable — caching and rate limiting will be disabled', {
          error: (err as Error).message,
        });
      }
    } else {
      appLogger.info('REDIS_URL not set — skipping Redis, caching disabled');
    }

    // 3. Initialize service registry (starts logger auto-flush, etc.)
    await registry.initialize();

    // 4. Register health checkers on the route's healthCheck instance
    //    (routes/health.ts exports the healthCheck singleton used by GET /api/v1/health)
    healthCheck.register('database', async () => {
      try {
        const pool = (await import('./db/pool')).getPool();
        await pool.query('SELECT 1');
        return { status: 'healthy' as const, service: 'database', checkedAt: new Date().toISOString() };
      } catch (err) {
        return { status: 'unhealthy' as const, service: 'database', message: (err as Error).message, checkedAt: new Date().toISOString() };
      }
    });

    healthCheck.register('redis', async () => {
      try {
        const { getRedisClient: getClient } = await import('./middleware/cache');
        const client = getClient();
        if (!client) return { status: 'degraded' as const, service: 'redis', message: 'Redis not connected', checkedAt: new Date().toISOString() };
        await client.get('health-check');
        return { status: 'healthy' as const, service: 'redis', checkedAt: new Date().toISOString() };
      } catch (err) {
        return { status: 'degraded' as const, service: 'redis', message: (err as Error).message, checkedAt: new Date().toISOString() };
      }
    });

    healthCheck.register('ai-circuit-breaker', async () => {
      const state = circuitBreakers.aiProvider.getState();
      return state === CircuitState.OPEN
        ? { status: 'degraded' as const, service: 'ai-circuit-breaker', message: 'AI provider circuit breaker is open', checkedAt: new Date().toISOString() }
        : { status: 'healthy' as const, service: 'ai-circuit-breaker', checkedAt: new Date().toISOString() };
    });

    // 5. Start background jobs
    startBackgroundJobs();

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      appLogger.info(`KrishiMitra-AI backend running on port ${PORT}`);
    });
  } catch (err) {
    appLogger.error('Failed to start server', err as Error);
    process.exit(1);
  }
}

// ── Background Jobs ───────────────────────────────────────────

function startBackgroundJobs(): void {
  const PRICE_ALERT_INTERVAL_MS = 60 * 60 * 1000; // every hour

  async function runPriceAlerts() {
    try {
      const alerts = await registry.alertGenerator.checkPriceAlerts();
      if (alerts.length > 0) {
        appLogger.info(`Price alert cron: ${alerts.length} alert(s) triggered`);
      }
    } catch (err) {
      appLogger.warn('Price alert cron error', { error: (err as Error).message });
    }
  }

  // Run once at startup (after a short delay to let DB settle), then hourly
  setTimeout(runPriceAlerts, 10_000);
  setInterval(runPriceAlerts, PRICE_ALERT_INTERVAL_MS);

  // Pest alerts — run once daily
  const PEST_ALERT_INTERVAL_MS = 24 * 60 * 60 * 1000;

  async function runPestAlerts() {
    try {
      const alerts = await registry.pestAlertService.checkPestAlerts();
      if (alerts.length > 0) {
        appLogger.info(`Pest alert cron: ${alerts.length} alert(s) triggered`);
      }
    } catch (err) {
      appLogger.warn('Pest alert cron error', { error: (err as Error).message });
    }
  }

  setTimeout(runPestAlerts, 30_000); // 30s after startup
  setInterval(runPestAlerts, PEST_ALERT_INTERVAL_MS);

  // Index any knowledge_articles that don't have embeddings yet (runs once at startup)
  setTimeout(async () => {
    try {
      const { getPool } = await import('./db/pool');
      const pool = getPool();
      const result = await pool.query(
        `SELECT id, tenant_id FROM knowledge_articles WHERE embedding IS NULL AND status = 'approved' LIMIT 50`,
      );
      if (result.rows.length === 0) {
        appLogger.info('Knowledge base: all articles already indexed');
        return;
      }
      appLogger.info(`Knowledge base: indexing ${result.rows.length} unembedded article(s)...`);
      let indexed = 0;
      for (const row of result.rows) {
        try {
          await registry.ragSystem.index(row.id as string, row.tenant_id as string);
          indexed++;
        } catch (err) {
          appLogger.warn(`Knowledge base: failed to index article ${row.id as string}`, { error: (err as Error).message });
        }
      }
      appLogger.info(`Knowledge base: indexed ${indexed}/${result.rows.length} article(s)`);
    } catch (err) {
      appLogger.warn('Knowledge base indexer error', { error: (err as Error).message });
    }
  }, 15_000);

  appLogger.info('Background jobs started (price alerts: hourly, KB indexer: once)');
}

// ── Graceful shutdown ─────────────────────────────────────────

process.on('SIGTERM', async () => {
  appLogger.info('SIGTERM received — shutting down gracefully');
  await registry.shutdown();
  const { closePool } = await import('./db/pool');
  await closePool();
  process.exit(0);
});

process.on('SIGINT', async () => {
  appLogger.info('SIGINT received — shutting down gracefully');
  await registry.shutdown();
  const { closePool } = await import('./db/pool');
  await closePool();
  process.exit(0);
});

if (process.env.NODE_ENV !== 'test') {
  startServer();
}

export default app;
