import { Router, Response } from 'express';
import { PlatformAdminService } from '../services/admin/PlatformAdminService';
import { authenticate, AuthenticatedRequest } from '../middleware/authenticate';
import { requirePermissions, Permission } from '../middleware/rbac';
import { TenantType } from '../types/enums';

const router = Router();
const platformService = new PlatformAdminService();

// All platform admin routes require authentication
router.use(authenticate);

// ── Tenant Provisioning ─────────────────────────────────────────

/**
 * POST /api/v1/platform/tenants
 * Body: { name, type, admin_name, admin_phone, admin_email?, settings?, limits? }
 */
router.post(
  '/tenants',
  requirePermissions(Permission.PLATFORM_TENANTS_MANAGE),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const { name, type, admin_name, admin_phone, admin_email, settings, limits } = req.body;

      if (!name || !type || !admin_name || !admin_phone) {
        res.status(400).json({ error: 'name, type, admin_name, and admin_phone are required.' });
        return;
      }

      const validTypes = Object.values(TenantType);
      if (!validTypes.includes(type)) {
        res.status(400).json({ error: `Invalid tenant type. Must be one of: ${validTypes.join(', ')}` });
        return;
      }

      const result = await platformService.createTenant(
        { name, type, admin_name, admin_phone, admin_email, settings, limits },
        user.id,
      );
      res.status(201).json(result);
    } catch (err) {
      handleError(res, err);
    }
  },
);

/**
 * POST /api/v1/platform/tenants/:id/suspend
 * Body: { reason }
 */
router.post(
  '/tenants/:id/suspend',
  requirePermissions(Permission.PLATFORM_TENANTS_MANAGE),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const { reason } = req.body;

      if (!reason) {
        res.status(400).json({ error: 'reason is required.' });
        return;
      }

      const tenant = await platformService.suspendTenant(req.params.id, reason, user.id);
      res.json(tenant);
    } catch (err) {
      if (err instanceof Error && err.message === 'Tenant not found') {
        res.status(404).json({ error: err.message });
        return;
      }
      if (err instanceof Error && err.message.includes('Cannot suspend')) {
        res.status(400).json({ error: err.message });
        return;
      }
      handleError(res, err);
    }
  },
);

/**
 * DELETE /api/v1/platform/tenants/:id
 */
router.delete(
  '/tenants/:id',
  requirePermissions(Permission.PLATFORM_TENANTS_MANAGE),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const deleted = await platformService.deleteTenant(req.params.id, user.id);
      if (!deleted) {
        res.status(404).json({ error: 'Tenant not found.' });
        return;
      }
      res.json({ success: true });
    } catch (err) {
      handleError(res, err);
    }
  },
);

// ── Dashboard ───────────────────────────────────────────────────

/**
 * GET /api/v1/platform/dashboard
 */
router.get(
  '/dashboard',
  requirePermissions(Permission.PLATFORM_ANALYTICS),
  async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const tenants = await platformService.getTenantDashboard();
      res.json({ tenants });
    } catch (err) {
      handleError(res, err);
    }
  },
);

// ── Global AI Configuration ─────────────────────────────────────

/**
 * GET /api/v1/platform/ai-config
 */
router.get(
  '/ai-config',
  requirePermissions(Permission.PLATFORM_CONFIG),
  async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const config = await platformService.getGlobalAIConfig();
      res.json(config);
    } catch (err) {
      handleError(res, err);
    }
  },
);

/**
 * PUT /api/v1/platform/ai-config
 * Body: Partial<GlobalAIConfig>
 */
router.put(
  '/ai-config',
  requirePermissions(Permission.PLATFORM_CONFIG),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const config = await platformService.updateGlobalAIConfig(req.body, user.id);
      res.json(config);
    } catch (err) {
      handleError(res, err);
    }
  },
);

// ── Cross-Tenant Analytics ──────────────────────────────────────

/**
 * GET /api/v1/platform/analytics
 */
router.get(
  '/analytics',
  requirePermissions(Permission.PLATFORM_ANALYTICS),
  async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const analytics = await platformService.getCrossTenantAnalytics();
      res.json(analytics);
    } catch (err) {
      handleError(res, err);
    }
  },
);

// ── Data Export ──────────────────────────────────────────────────

/**
 * POST /api/v1/platform/tenants/:id/export
 */
router.post(
  '/tenants/:id/export',
  requirePermissions(Permission.PLATFORM_TENANTS_MANAGE),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const exportReq = await platformService.requestDataExport(req.params.id, user.id);
      res.status(201).json(exportReq);
    } catch (err) {
      if (err instanceof Error && err.message === 'Tenant not found') {
        res.status(404).json({ error: err.message });
        return;
      }
      handleError(res, err);
    }
  },
);

// ── Feature Flags ───────────────────────────────────────────────

/**
 * GET /api/v1/platform/tenants/:id/feature-flags
 */
router.get(
  '/tenants/:id/feature-flags',
  requirePermissions(Permission.PLATFORM_CONFIG),
  async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const flags = await platformService.getFeatureFlags(_req.params.id);
      res.json(flags);
    } catch (err) {
      if (err instanceof Error && err.message === 'Tenant not found') {
        res.status(404).json({ error: err.message });
        return;
      }
      handleError(res, err);
    }
  },
);

/**
 * PUT /api/v1/platform/tenants/:id/feature-flags
 * Body: { [feature]: boolean }
 */
router.put(
  '/tenants/:id/feature-flags',
  requirePermissions(Permission.PLATFORM_CONFIG),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const flags = await platformService.updateFeatureFlags(req.params.id, req.body, user.id);
      res.json(flags);
    } catch (err) {
      if (err instanceof Error && err.message === 'Tenant not found') {
        res.status(404).json({ error: err.message });
        return;
      }
      handleError(res, err);
    }
  },
);

// ── Maintenance Scheduling ──────────────────────────────────────

/**
 * POST /api/v1/platform/maintenance
 * Body: { title, description, scheduled_start, scheduled_end }
 */
router.post(
  '/maintenance',
  requirePermissions(Permission.PLATFORM_CONFIG),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const { title, description, scheduled_start, scheduled_end } = req.body;

      if (!title || !description || !scheduled_start || !scheduled_end) {
        res.status(400).json({ error: 'title, description, scheduled_start, and scheduled_end are required.' });
        return;
      }

      const window = await platformService.scheduleMaintenance(
        { title, description, scheduled_start, scheduled_end },
        user.id,
      );
      res.status(201).json(window);
    } catch (err) {
      if (err instanceof Error && err.message.includes('24 hours')) {
        res.status(400).json({ error: err.message });
        return;
      }
      handleError(res, err);
    }
  },
);

/**
 * GET /api/v1/platform/maintenance
 */
router.get(
  '/maintenance',
  requirePermissions(Permission.PLATFORM_CONFIG),
  async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const windows = await platformService.getMaintenanceWindows();
      res.json({ maintenance_windows: windows });
    } catch (err) {
      handleError(res, err);
    }
  },
);

function handleError(res: Response, err: unknown) {
  console.error('Platform admin route error:', err);
  res.status(500).json({ error: 'Internal server error.' });
}

export default router;
