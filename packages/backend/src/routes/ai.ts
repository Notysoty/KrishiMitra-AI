import { Router, Response } from 'express';
import { authenticate, AuthenticatedRequest } from '../middleware/authenticate';
import { requirePermissions, Permission } from '../middleware/rbac';
import { AIAssistant, UserContext } from '../services/ai/AIAssistant';
import { WorkflowService, WorkflowError } from '../services/ai/WorkflowService';
import { WorkflowType } from '../types/workflow';

const router = Router();
const aiAssistant = new AIAssistant();
const workflowService = new WorkflowService();

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

// ── Workflow Routes ──────────────────────────────────────────────

const VALID_WORKFLOW_TYPES: WorkflowType[] = ['plan_season', 'check_eligibility'];

/**
 * POST /api/v1/ai/workflow/:type
 *
 * Execute an agentic workflow.
 * Supported types: plan_season, check_eligibility
 * Requires AI_WORKFLOW permission.
 *
 * Body: { farm?: FarmContext, language?: string }
 */
router.post(
  '/workflow/:type',
  requirePermissions(Permission.AI_WORKFLOW),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const workflowType = req.params.type as WorkflowType;

      if (!VALID_WORKFLOW_TYPES.includes(workflowType)) {
        res.status(400).json({
          error: `Invalid workflow type: ${req.params.type}. Supported types: ${VALID_WORKFLOW_TYPES.join(', ')}`,
        });
        return;
      }

      const { farm } = req.body;

      const result = await workflowService.execute(
        workflowType,
        user.id,
        user.tenant_id,
        farm,
      );

      res.json(result);
    } catch (err) {
      if (err instanceof WorkflowError) {
        res.status(400).json({ error: err.message });
        return;
      }
      console.error('Workflow error:', err);
      res.status(500).json({ error: 'An error occurred while executing the workflow.' });
    }
  },
);

/**
 * GET /api/v1/ai/workflow/results
 *
 * Get saved workflow results for the current user.
 * Requires AI_WORKFLOW permission.
 */
router.get(
  '/workflow/results',
  requirePermissions(Permission.AI_WORKFLOW),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const results = workflowService.getStore().listByUser(user.id, user.tenant_id);
      res.json({ results, count: results.length });
    } catch (err) {
      console.error('Workflow results error:', err);
      res.status(500).json({ error: 'An error occurred while fetching workflow results.' });
    }
  },
);

/**
 * GET /api/v1/ai/workflow/results/:id
 *
 * Get a specific saved workflow result.
 * Requires AI_WORKFLOW permission.
 */
router.get(
  '/workflow/results/:id',
  requirePermissions(Permission.AI_WORKFLOW),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const result = workflowService.getStore().get(req.params.id, user.id, user.tenant_id);
      if (!result) {
        res.status(404).json({ error: 'Workflow result not found.' });
        return;
      }
      res.json(result);
    } catch (err) {
      console.error('Workflow result error:', err);
      res.status(500).json({ error: 'An error occurred while fetching the workflow result.' });
    }
  },
);

export default router;
