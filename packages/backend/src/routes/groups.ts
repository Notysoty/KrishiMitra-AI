import { Router, Response } from 'express';
import { GroupService, MAX_GROUP_SIZE } from '../services/admin/GroupService';
import { authenticate, AuthenticatedRequest } from '../middleware/authenticate';
import { requirePermissions, Permission } from '../middleware/rbac';

const router = Router();
const groupService = new GroupService();

router.use(authenticate);

/**
 * POST /api/v1/groups
 * Body: { name, description? }
 */
router.post(
  '/',
  requirePermissions(Permission.GROUP_MANAGE),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const { name, description } = req.body;

      if (!name) {
        res.status(400).json({ error: 'name is required.' });
        return;
      }

      const group = await groupService.createGroup(user.tenant_id, user.id, name, description);
      res.status(201).json(group);
    } catch (err) {
      handleError(res, err);
    }
  },
);

/**
 * GET /api/v1/groups
 * Query: ?limit=50&offset=0
 */
router.get(
  '/',
  requirePermissions(Permission.GROUP_MANAGE),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
      const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : undefined;

      const result = await groupService.listGroups(user.tenant_id, user.id, { limit, offset });
      res.json(result);
    } catch (err) {
      handleError(res, err);
    }
  },
);

/**
 * GET /api/v1/groups/:id/members
 */
router.get(
  '/:id/members',
  requirePermissions(Permission.GROUP_MANAGE),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const members = await groupService.getMembers(user.tenant_id, req.params.id);
      res.json(members);
    } catch (err) {
      if (err instanceof Error && err.message === 'Group not found') {
        res.status(404).json({ error: err.message });
        return;
      }
      handleError(res, err);
    }
  },
);

/**
 * POST /api/v1/groups/:id/members
 * Body: { phone }
 */
router.post(
  '/:id/members',
  requirePermissions(Permission.GROUP_MANAGE),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const { phone } = req.body;

      if (!phone) {
        res.status(400).json({ error: 'phone is required.' });
        return;
      }

      const member = await groupService.addFarmerByPhone(user.tenant_id, req.params.id, phone, user.id);
      res.status(201).json(member);
    } catch (err) {
      if (err instanceof Error && err.message === 'Group not found') {
        res.status(404).json({ error: err.message });
        return;
      }
      if (err instanceof Error && err.message.includes('maximum size')) {
        res.status(400).json({ error: err.message });
        return;
      }
      if (err instanceof Error && err.message === 'User not found with this phone number') {
        res.status(404).json({ error: err.message });
        return;
      }
      if (err instanceof Error && err.message.includes('already a member')) {
        res.status(409).json({ error: err.message });
        return;
      }
      handleError(res, err);
    }
  },
);

/**
 * DELETE /api/v1/groups/:id/members/:userId
 */
router.delete(
  '/:id/members/:userId',
  requirePermissions(Permission.GROUP_MANAGE),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const removed = await groupService.removeFarmer(user.tenant_id, req.params.id, req.params.userId, user.id);
      if (!removed) {
        res.status(404).json({ error: 'Member not found in group.' });
        return;
      }
      res.json({ success: true });
    } catch (err) {
      if (err instanceof Error && err.message === 'Group not found') {
        res.status(404).json({ error: err.message });
        return;
      }
      handleError(res, err);
    }
  },
);

/**
 * POST /api/v1/groups/:id/broadcast
 * Body: { content }
 */
router.post(
  '/:id/broadcast',
  requirePermissions(Permission.GROUP_BROADCAST),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const { content } = req.body;

      if (!content) {
        res.status(400).json({ error: 'content is required.' });
        return;
      }

      const broadcast = await groupService.broadcastMessage(user.tenant_id, req.params.id, user.id, content);
      res.status(201).json(broadcast);
    } catch (err) {
      if (err instanceof Error && err.message === 'Group not found') {
        res.status(404).json({ error: err.message });
        return;
      }
      if (err instanceof Error && err.message === 'Group has no members') {
        res.status(400).json({ error: err.message });
        return;
      }
      handleError(res, err);
    }
  },
);

/**
 * POST /api/v1/groups/broadcasts/:broadcastId/view
 */
router.post(
  '/broadcasts/:broadcastId/view',
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const viewed = await groupService.markMessageViewed(req.params.broadcastId, user.id);
      res.json({ viewed });
    } catch (err) {
      handleError(res, err);
    }
  },
);

/**
 * GET /api/v1/groups/:id/broadcasts/:broadcastId/tracking
 */
router.get(
  '/:id/broadcasts/:broadcastId/tracking',
  requirePermissions(Permission.GROUP_MANAGE),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const tracking = await groupService.getDeliveryTracking(
        user.tenant_id, req.params.id, req.params.broadcastId,
      );
      res.json(tracking);
    } catch (err) {
      if (err instanceof Error && (err.message === 'Group not found' || err.message === 'Broadcast not found')) {
        res.status(404).json({ error: err.message });
        return;
      }
      handleError(res, err);
    }
  },
);

/**
 * GET /api/v1/groups/:id/analytics
 */
router.get(
  '/:id/analytics',
  requirePermissions(Permission.GROUP_MANAGE),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const analytics = await groupService.getGroupAnalytics(user.tenant_id, req.params.id);
      res.json(analytics);
    } catch (err) {
      if (err instanceof Error && err.message === 'Group not found') {
        res.status(404).json({ error: err.message });
        return;
      }
      handleError(res, err);
    }
  },
);

/**
 * GET /api/v1/groups/:id/export
 */
router.get(
  '/:id/export',
  requirePermissions(Permission.GROUP_MANAGE),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const data = await groupService.exportGroupData(user.tenant_id, req.params.id);
      res.json(data);
    } catch (err) {
      if (err instanceof Error && err.message === 'Group not found') {
        res.status(404).json({ error: err.message });
        return;
      }
      handleError(res, err);
    }
  },
);

function handleError(res: Response, err: unknown) {
  console.error('Groups route error:', err);
  res.status(500).json({ error: 'Internal server error.' });
}

export default router;
