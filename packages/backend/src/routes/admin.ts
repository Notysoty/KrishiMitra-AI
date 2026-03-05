import { Router, Response } from 'express';
import { TenantAdminService, MAX_BULK_IMPORT_USERS } from '../services/admin/TenantAdminService';
import { authenticate, AuthenticatedRequest } from '../middleware/authenticate';
import { requirePermissions, Permission } from '../middleware/rbac';
import { Role, ArticleStatus } from '../types/enums';

const router = Router();
const adminService = new TenantAdminService();

// All admin routes require authentication
router.use(authenticate);

// ── Branding ────────────────────────────────────────────────────

/**
 * PUT /api/v1/admin/branding
 * Body: { logo_url?, primary_color?, secondary_color?, org_name? }
 */
router.put(
  '/branding',
  requirePermissions(Permission.TENANT_SETTINGS),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const tenant = await adminService.updateBranding(user.tenant_id, req.body, user.id);
      res.json(tenant);
    } catch (err) {
      handleError(res, err);
    }
  },
);

// ── User Management ─────────────────────────────────────────────

/**
 * GET /api/v1/admin/users
 * Query: ?limit=50&offset=0
 */
router.get(
  '/users',
  requirePermissions(Permission.TENANT_USERS_MANAGE),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
      const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : undefined;
      const result = await adminService.listUsers(user.tenant_id, { limit, offset });
      res.json(result);
    } catch (err) {
      handleError(res, err);
    }
  },
);


/**
 * POST /api/v1/admin/users
 * Body: { phone, name, email?, roles, language_preference? }
 */
router.post(
  '/users',
  requirePermissions(Permission.TENANT_USERS_MANAGE),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const { phone, name, email, roles, language_preference } = req.body;

      if (!phone || !name || !roles || !Array.isArray(roles) || roles.length === 0) {
        res.status(400).json({ error: 'phone, name, and roles (non-empty array) are required.' });
        return;
      }

      const validRoles = Object.values(Role);
      for (const role of roles) {
        if (!validRoles.includes(role)) {
          res.status(400).json({ error: `Invalid role: ${role}` });
          return;
        }
      }

      const newUser = await adminService.addUser(
        user.tenant_id,
        { phone, name, email, roles, language_preference },
        user.id,
        user.roles,
      );
      res.status(201).json(newUser);
    } catch (err) {
      if (err instanceof Error && err.message.includes('Not authorized')) {
        res.status(403).json({ error: err.message });
        return;
      }
      handleError(res, err);
    }
  },
);

/**
 * DELETE /api/v1/admin/users/:id
 */
router.delete(
  '/users/:id',
  requirePermissions(Permission.TENANT_USERS_MANAGE),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const removed = await adminService.removeUser(user.tenant_id, req.params.id, user.id);
      if (!removed) {
        res.status(404).json({ error: 'User not found.' });
        return;
      }
      res.json({ success: true });
    } catch (err) {
      handleError(res, err);
    }
  },
);

/**
 * PUT /api/v1/admin/users/:id/roles
 * Body: { roles: Role[] }
 */
router.put(
  '/users/:id/roles',
  requirePermissions(Permission.TENANT_USERS_MANAGE),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const { roles } = req.body;

      if (!roles || !Array.isArray(roles) || roles.length === 0) {
        res.status(400).json({ error: 'roles (non-empty array) is required.' });
        return;
      }

      const updated = await adminService.assignRole(
        user.tenant_id,
        req.params.id,
        roles,
        user.id,
        user.roles,
      );
      res.json(updated);
    } catch (err) {
      if (err instanceof Error && err.message.includes('Not authorized')) {
        res.status(403).json({ error: err.message });
        return;
      }
      if (err instanceof Error && err.message === 'User not found') {
        res.status(404).json({ error: err.message });
        return;
      }
      handleError(res, err);
    }
  },
);

/**
 * POST /api/v1/admin/users/bulk-import
 * Body: { users: CsvUserRow[] }
 */
router.post(
  '/users/bulk-import',
  requirePermissions(Permission.TENANT_USERS_MANAGE),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const { users } = req.body;

      if (!users || !Array.isArray(users)) {
        res.status(400).json({ error: 'users array is required.' });
        return;
      }

      if (users.length > MAX_BULK_IMPORT_USERS) {
        res.status(400).json({ error: `Bulk import limited to ${MAX_BULK_IMPORT_USERS} users.` });
        return;
      }

      const result = await adminService.bulkImportUsers(user.tenant_id, users, user.id, user.roles);
      res.json(result);
    } catch (err) {
      handleError(res, err);
    }
  },
);

// ── Regional Preferences ────────────────────────────────────────

/**
 * PUT /api/v1/admin/preferences/regional
 * Body: { supported_languages?, supported_crops?, supported_markets?, default_region? }
 */
router.put(
  '/preferences/regional',
  requirePermissions(Permission.TENANT_SETTINGS),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const tenant = await adminService.updateRegionalPreferences(user.tenant_id, req.body, user.id);
      res.json(tenant);
    } catch (err) {
      handleError(res, err);
    }
  },
);

/**
 * PUT /api/v1/admin/preferences/notifications
 * Body: { in_app, sms, email, price_alerts, weather_alerts, pest_alerts }
 */
router.put(
  '/preferences/notifications',
  requirePermissions(Permission.TENANT_SETTINGS),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const tenant = await adminService.setNotificationDefaults(user.tenant_id, req.body, user.id);
      res.json(tenant);
    } catch (err) {
      handleError(res, err);
    }
  },
);

// ── Content Approval ────────────────────────────────────────────

/**
 * GET /api/v1/admin/content/pending
 * Query: ?limit=50&offset=0
 */
router.get(
  '/content/pending',
  requirePermissions(Permission.TENANT_CONTENT),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
      const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : undefined;
      const result = await adminService.getPendingContent(user.tenant_id, { limit, offset });
      res.json(result);
    } catch (err) {
      handleError(res, err);
    }
  },
);

/**
 * POST /api/v1/admin/content/review
 * Body: { article_id, action: 'approve' | 'reject', reviewer_notes? }
 */
router.post(
  '/content/review',
  requirePermissions(Permission.TENANT_CONTENT),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const { article_id, action, reviewer_notes } = req.body;

      if (!article_id || !action || !['approve', 'reject'].includes(action)) {
        res.status(400).json({ error: 'article_id and action (approve/reject) are required.' });
        return;
      }

      const article = await adminService.processContentApproval(
        user.tenant_id,
        { article_id, action, reviewer_notes },
        user.id,
      );
      res.json(article);
    } catch (err) {
      if (err instanceof Error && err.message === 'Article not found') {
        res.status(404).json({ error: err.message });
        return;
      }
      if (err instanceof Error && err.message.includes('not pending review')) {
        res.status(400).json({ error: err.message });
        return;
      }
      handleError(res, err);
    }
  },
);

// ── Analytics ───────────────────────────────────────────────────

/**
 * GET /api/v1/admin/analytics
 */
router.get(
  '/analytics',
  requirePermissions(Permission.TENANT_ANALYTICS),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const analytics = await adminService.getUsageAnalytics(user.tenant_id);
      res.json(analytics);
    } catch (err) {
      handleError(res, err);
    }
  },
);

// ── Audit Logs ──────────────────────────────────────────────────

/**
 * GET /api/v1/admin/audit-logs
 * Query: ?limit=50&offset=0&action=add_user&userId=xxx
 */
router.get(
  '/audit-logs',
  requirePermissions(Permission.AUDIT_VIEW),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
      const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : undefined;
      const action = req.query.action as string | undefined;
      const userId = req.query.userId as string | undefined;

      const result = await adminService.getAuditLogs(user.tenant_id, { limit, offset, action, userId });
      res.json(result);
    } catch (err) {
      handleError(res, err);
    }
  },
);

function handleError(res: Response, err: unknown) {
  console.error('Admin route error:', err);
  res.status(500).json({ error: 'Internal server error.' });
}

export default router;
