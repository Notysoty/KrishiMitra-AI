import { Router, Response } from 'express';
import { AuditService } from '../services/admin/AuditService';
import { authenticate, AuthenticatedRequest } from '../middleware/authenticate';
import { requirePermissions, Permission } from '../middleware/rbac';

const router = Router();
const auditService = new AuditService();

// All audit routes require authentication and AUDIT_VIEW permission
router.use(authenticate);

/**
 * GET /api/v1/audit/logs
 * Search/filter audit logs.
 * Query: ?limit=50&offset=0&action=add_user&userId=xxx&resourceType=user
 *        &startDate=2024-01-01&endDate=2024-12-31&sensitive=true&suspicious=true
 */
router.get(
  '/logs',
  requirePermissions(Permission.AUDIT_VIEW),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const filter = buildFilter(req, user.tenant_id);
      const result = await auditService.search(filter);
      res.json(result);
    } catch (err) {
      handleError(res, err);
    }
  },
);

/**
 * GET /api/v1/audit/logs/export
 * Export audit logs as CSV.
 * Same query params as /logs.
 */
router.get(
  '/logs/export',
  requirePermissions(Permission.AUDIT_VIEW),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const filter = buildFilter(req, user.tenant_id);
      const csv = await auditService.exportCsv(filter);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="audit_logs.csv"');
      res.send(csv);
    } catch (err) {
      handleError(res, err);
    }
  },
);

/**
 * GET /api/v1/audit/suspicious
 * Get flagged suspicious activity entries.
 * Query: ?limit=50&offset=0
 */
router.get(
  '/suspicious',
  requirePermissions(Permission.AUDIT_VIEW),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
      const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : undefined;
      const result = await auditService.getSuspiciousActivity({
        tenant_id: user.tenant_id,
        limit,
        offset,
      });
      res.json(result);
    } catch (err) {
      handleError(res, err);
    }
  },
);

/**
 * GET /api/v1/audit/retention
 * Get audit log retention policy info.
 */
router.get(
  '/retention',
  requirePermissions(Permission.AUDIT_VIEW),
  async (_req: AuthenticatedRequest, res: Response) => {
    try {
      res.json({
        retention_years: auditService.getRetentionYears(),
        cutoff_date: auditService.getRetentionCutoffDate().toISOString(),
      });
    } catch (err) {
      handleError(res, err);
    }
  },
);

function buildFilter(req: AuthenticatedRequest, tenantId: string) {
  return {
    tenant_id: tenantId,
    user_id: req.query.userId as string | undefined,
    action: req.query.action as string | undefined,
    resource_type: req.query.resourceType as string | undefined,
    start_date: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
    end_date: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
    is_sensitive: req.query.sensitive === 'true' ? true : req.query.sensitive === 'false' ? false : undefined,
    is_suspicious: req.query.suspicious === 'true' ? true : req.query.suspicious === 'false' ? false : undefined,
    limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
    offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined,
  };
}

function handleError(res: Response, err: unknown) {
  console.error('Audit route error:', err);
  res.status(500).json({ error: 'Internal server error.' });
}

export default router;
