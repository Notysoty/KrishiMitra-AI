import { Router, Response } from 'express';
import { ContentModerationService } from '../services/admin/ContentModerationService';
import { authenticate, AuthenticatedRequest } from '../middleware/authenticate';
import { requirePermissions, Permission } from '../middleware/rbac';
import { ContentModerationStatus } from '../types/enums';

const router = Router();
const moderationService = new ContentModerationService();

router.use(authenticate);

/**
 * POST /api/v1/moderation/queue
 * Body: { article_id, content_snapshot, confidence_score?, sources? }
 */
router.post(
  '/queue',
  requirePermissions(Permission.KNOWLEDGE_CREATE),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const { article_id, content_snapshot, confidence_score, sources } = req.body;

      if (!article_id || !content_snapshot) {
        res.status(400).json({ error: 'article_id and content_snapshot are required.' });
        return;
      }

      // Automated content filtering
      const filterResult = moderationService.filterContent(content_snapshot);
      if (!filterResult.passed) {
        res.status(400).json({
          error: 'Content contains prohibited language.',
          flagged_words: filterResult.flaggedWords,
        });
        return;
      }

      const item = await moderationService.queueForReview(
        user.tenant_id, article_id, content_snapshot, confidence_score, sources,
      );
      res.status(201).json(item);
    } catch (err) {
      handleError(res, err);
    }
  },
);

/**
 * GET /api/v1/moderation/queue
 * Query: ?status=queued&limit=50&offset=0
 */
router.get(
  '/queue',
  requirePermissions(Permission.KNOWLEDGE_APPROVE),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const status = req.query.status as ContentModerationStatus | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
      const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : undefined;

      const result = await moderationService.getQueue(user.tenant_id, { status, limit, offset });
      res.json(result);
    } catch (err) {
      handleError(res, err);
    }
  },
);

/**
 * POST /api/v1/moderation/review
 * Body: { item_id, action: 'approve' | 'reject', reviewer_notes? }
 */
router.post(
  '/review',
  requirePermissions(Permission.KNOWLEDGE_APPROVE),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const { item_id, action, reviewer_notes } = req.body;

      if (!item_id || !action || !['approve', 'reject'].includes(action)) {
        res.status(400).json({ error: 'item_id and action (approve/reject) are required.' });
        return;
      }

      const item = await moderationService.reviewContent(
        user.tenant_id, { item_id, action, reviewer_notes }, user.id,
      );
      res.json(item);
    } catch (err) {
      if (err instanceof Error && err.message === 'Moderation item not found') {
        res.status(404).json({ error: err.message });
        return;
      }
      if (err instanceof Error && err.message.includes('not queued')) {
        res.status(400).json({ error: err.message });
        return;
      }
      handleError(res, err);
    }
  },
);

/**
 * POST /api/v1/moderation/flag-outdated
 */
router.post(
  '/flag-outdated',
  requirePermissions(Permission.KNOWLEDGE_APPROVE),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const count = await moderationService.flagOutdatedContent(user.tenant_id);
      res.json({ flagged_count: count });
    } catch (err) {
      handleError(res, err);
    }
  },
);

/**
 * GET /api/v1/moderation/stats
 */
router.get(
  '/stats',
  requirePermissions(Permission.KNOWLEDGE_APPROVE),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const stats = await moderationService.getStats(user.tenant_id);
      res.json(stats);
    } catch (err) {
      handleError(res, err);
    }
  },
);

/**
 * GET /api/v1/moderation/history/:articleId
 */
router.get(
  '/history/:articleId',
  requirePermissions(Permission.KNOWLEDGE_APPROVE),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const history = await moderationService.getVersionHistory(user.tenant_id, req.params.articleId);
      res.json(history);
    } catch (err) {
      handleError(res, err);
    }
  },
);

function handleError(res: Response, err: unknown) {
  console.error('Moderation route error:', err);
  res.status(500).json({ error: 'Internal server error.' });
}

export default router;
