/**
 * Health check endpoint.
 * GET /api/v1/health – aggregated health report for all critical services.
 *
 * Requirements: 31.10
 */

import { Router, Request, Response } from 'express';
import { HealthCheck } from '../services/resilience';

const router = Router();

// Shared HealthCheck instance – services register their checks at startup.
export const healthCheck = new HealthCheck();

// GET /api/v1/health
router.get('/', async (_req: Request, res: Response) => {
  try {
    const report = await healthCheck.check();
    const statusCode = report.status === 'healthy' ? 200 : report.status === 'degraded' ? 200 : 503;
    res.status(statusCode).json(report);
  } catch (err) {
    res.status(503).json({
      status: 'unhealthy',
      services: [],
      checkedAt: new Date().toISOString(),
    });
  }
});

export default router;
