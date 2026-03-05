import { Router, Response } from 'express';
import { SustainabilityCalculator, SustainabilityError } from '../services/sustainability';
import { authenticate, AuthenticatedRequest } from '../middleware/authenticate';
import { requirePermissions, Permission } from '../middleware/rbac';

const router = Router();
const calculator = new SustainabilityCalculator();

// All sustainability routes require authentication
router.use(authenticate);

/**
 * GET /api/v1/sustainability/water-efficiency/:farmId
 */
router.get(
  '/water-efficiency/:farmId',
  requirePermissions(Permission.SUSTAINABILITY_VIEW),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const { farmId } = req.params;

      if (!farmId) {
        res.status(400).json({ error: 'Farm ID is required.' });
        return;
      }

      const result = await calculator.calculateWaterEfficiency(user.tenant_id, farmId);
      res.json(result);
    } catch (err) {
      handleError(res, err);
    }
  },
);

/**
 * GET /api/v1/sustainability/input-efficiency/:farmId
 */
router.get(
  '/input-efficiency/:farmId',
  requirePermissions(Permission.SUSTAINABILITY_VIEW),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const { farmId } = req.params;

      if (!farmId) {
        res.status(400).json({ error: 'Farm ID is required.' });
        return;
      }

      const result = await calculator.calculateInputEfficiency(user.tenant_id, farmId);
      res.json(result);
    } catch (err) {
      handleError(res, err);
    }
  },
);

/**
 * GET /api/v1/sustainability/climate-risk/:farmId
 */
router.get(
  '/climate-risk/:farmId',
  requirePermissions(Permission.SUSTAINABILITY_VIEW),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const { farmId } = req.params;

      if (!farmId) {
        res.status(400).json({ error: 'Farm ID is required.' });
        return;
      }

      const result = await calculator.calculateClimateRiskIndex(user.tenant_id, farmId);
      res.json(result);
    } catch (err) {
      handleError(res, err);
    }
  },
);

/**
 * GET /api/v1/sustainability/insights/:farmId
 */
router.get(
  '/insights/:farmId',
  requirePermissions(Permission.SUSTAINABILITY_VIEW),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const { farmId } = req.params;

      if (!farmId) {
        res.status(400).json({ error: 'Farm ID is required.' });
        return;
      }

      const result = await calculator.getSustainabilityInsights(user.tenant_id, farmId);
      res.json(result);
    } catch (err) {
      handleError(res, err);
    }
  },
);

function handleError(res: Response, err: unknown) {
  if (err instanceof SustainabilityError) {
    res.status(err.statusCode).json({ error: err.message });
  } else {
    console.error('Sustainability route error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
}

export default router;
