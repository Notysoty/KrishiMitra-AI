import { Router, Response } from 'express';
import { SchemeService } from '../services/scheme/SchemeService';
import { authenticate, AuthenticatedRequest } from '../middleware/authenticate';
import { requirePermissions, Permission } from '../middleware/rbac';

const router = Router();
const schemeService = new SchemeService();

// All scheme routes require authentication
router.use(authenticate);

/**
 * POST /api/v1/schemes/check-eligibility
 * Body: { farm?: FarmContext }
 *
 * Evaluates government scheme eligibility based on the provided farm profile.
 */
router.post(
  '/check-eligibility',
  requirePermissions(Permission.AI_WORKFLOW),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { farm } = req.body;
      const result = schemeService.checkEligibility(farm);
      res.json(result);
    } catch (err) {
      console.error('Scheme route error:', err);
      res.status(500).json({ error: 'Internal server error.' });
    }
  },
);

/**
 * GET /api/v1/schemes
 *
 * Returns all available schemes with eligibility evaluated against the optional
 * farm profile provided as query parameters.
 */
router.get(
  '/',
  requirePermissions(Permission.AI_WORKFLOW),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Optionally accept farm context via query params for a quick check
      const result = schemeService.checkEligibility(undefined);
      res.json(result);
    } catch (err) {
      console.error('Scheme route error:', err);
      res.status(500).json({ error: 'Internal server error.' });
    }
  },
);

export default router;
