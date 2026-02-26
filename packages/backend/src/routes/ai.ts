import { Router, Response } from 'express';
import { authenticate, AuthenticatedRequest } from '../middleware/authenticate';
import { requirePermissions, Permission } from '../middleware/rbac';
import { AIAssistant, UserContext } from '../services/ai/AIAssistant';

const router = Router();
const aiAssistant = new AIAssistant();

// All AI routes require authentication
router.use(authenticate);

/**
 * POST /api/v1/ai/chat
 *
 * Send a chat message to the AI assistant.
 * Requires AI_CHAT permission.
 *
 * Body: { query: string, language?: string, farm?: object }
 */
router.post(
  '/chat',
  requirePermissions(Permission.AI_CHAT),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const { query, language, farm } = req.body;

      if (!query || typeof query !== 'string' || query.trim().length === 0) {
        res.status(400).json({ error: 'query is required and must be a non-empty string.' });
        return;
      }

      const context: UserContext = {
        userId: user.id,
        tenantId: user.tenant_id,
        language: language ?? 'en',
        farm,
      };

      const response = await aiAssistant.processQuery(query.trim(), context);

      res.json({
        ...response,
        remaining_queries: aiAssistant.getRateLimiter().remaining(user.id),
      });
    } catch (err) {
      console.error('AI chat error:', err);
      res.status(500).json({ error: 'An error occurred while processing your query.' });
    }
  },
);

/**
 * GET /api/v1/ai/history
 *
 * Get the user's AI interaction history.
 * Requires AI_CHAT permission.
 *
 * Query params: limit (default 50)
 */
router.get(
  '/history',
  requirePermissions(Permission.AI_CHAT),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const limit = Math.min(Number(req.query.limit) || 50, 100);

      const history = aiAssistant
        .getLogger()
        .getHistory(user.id, user.tenant_id, limit);

      res.json({ history, count: history.length });
    } catch (err) {
      console.error('AI history error:', err);
      res.status(500).json({ error: 'An error occurred while fetching history.' });
    }
  },
);

export default router;
