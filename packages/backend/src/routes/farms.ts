import { Router, Response } from 'express';
import { FarmService, FarmError, CropService, CropError } from '../services/farm';
import { authenticate, AuthenticatedRequest } from '../middleware/authenticate';
import { requirePermissions, Permission } from '../middleware/rbac';

const router = Router();
const farmService = new FarmService();
const cropService = new CropService();

// All farm routes require authentication
router.use(authenticate);

// POST /api/v1/farms — Create farm profile
router.post(
  '/',
  requirePermissions(Permission.FARM_CREATE),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const farm = await farmService.createFarm(user.tenant_id, user.id, req.body);
      res.status(201).json(farm);
    } catch (err) {
      handleError(res, err);
    }
  }
);

// GET /api/v1/farms/:id — Get farm profile with crops
router.get(
  '/:id',
  requirePermissions(Permission.FARM_READ),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const farm = await farmService.getFarm(user.tenant_id, req.params.id);
      res.json(farm);
    } catch (err) {
      handleError(res, err);
    }
  }
);

// PUT /api/v1/farms/:id — Update farm profile
router.put(
  '/:id',
  requirePermissions(Permission.FARM_UPDATE),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const farm = await farmService.updateFarm(user.tenant_id, req.params.id, req.body);
      res.json(farm);
    } catch (err) {
      handleError(res, err);
    }
  }
);

// DELETE /api/v1/farms/:id — Delete farm profile (anonymizes historical data)
router.delete(
  '/:id',
  requirePermissions(Permission.FARM_DELETE),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const result = await farmService.deleteFarm(user.tenant_id, req.params.id);
      res.json(result);
    } catch (err) {
      handleError(res, err);
    }
  }
);

function handleError(res: Response, err: unknown) {
  if (err instanceof FarmError) {
    const body: Record<string, unknown> = { error: err.message };
    if (err.missingFields) {
      body.missingFields = err.missingFields;
    }
    res.status(err.statusCode).json(body);
  } else if (err instanceof CropError) {
    res.status(err.statusCode).json({ error: err.message });
  } else {
    console.error('Farm route error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
}

// ── Crop routes ──────────────────────────────────────────────

// POST /api/v1/farms/:id/crops — Add crop to farm
router.post(
  '/:id/crops',
  requirePermissions(Permission.CROP_MANAGE),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const crop = await cropService.addCrop(user.tenant_id, req.params.id, req.body);
      res.status(201).json(crop);
    } catch (err) {
      handleError(res, err);
    }
  }
);

// POST /api/v1/farms/:id/inputs — Log input usage
router.post(
  '/:id/inputs',
  requirePermissions(Permission.INPUT_LOG),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const inputLog = await cropService.logInput(user.tenant_id, req.params.id, req.body);
      res.status(201).json(inputLog);
    } catch (err) {
      handleError(res, err);
    }
  }
);

// POST /api/v1/farms/:id/yields — Record yield
router.post(
  '/:id/yields',
  requirePermissions(Permission.YIELD_LOG),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const yieldRecord = await cropService.recordYield(user.tenant_id, req.params.id, req.body);
      res.status(201).json(yieldRecord);
    } catch (err) {
      handleError(res, err);
    }
  }
);

export default router;
