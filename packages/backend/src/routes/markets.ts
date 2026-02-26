import { Router, Response } from 'express';
import { MarketService, MarketIntelligence, MarketError } from '../services/market';
import { authenticate, AuthenticatedRequest } from '../middleware/authenticate';
import { requirePermissions, Permission } from '../middleware/rbac';

const router = Router();
const marketService = new MarketService();
const marketIntelligence = new MarketIntelligence(marketService);

// All market routes require authentication
router.use(authenticate);

/**
 * GET /api/v1/markets/prices
 * Query params: ?crop=wheat&market=Azadpur+Mandi
 */
router.get(
  '/prices',
  requirePermissions(Permission.MARKET_VIEW),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const crop = req.query.crop as string | undefined;
      const result = await marketService.getPrices(user.tenant_id, crop);
      res.json(result);
    } catch (err) {
      handleError(res, err);
    }
  },
);

/**
 * GET /api/v1/markets/prices/history
 * Query params: ?crop=wheat&market=Azadpur+Mandi
 */
router.get(
  '/prices/history',
  requirePermissions(Permission.MARKET_VIEW),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const crop = req.query.crop as string | undefined;
      const market = req.query.market as string | undefined;

      if (!crop) {
        res.status(400).json({ error: 'Query parameter "crop" is required.' });
        return;
      }

      const result = await marketService.getHistoricalPrices(
        user.tenant_id,
        crop,
        market,
      );
      res.json(result);
    } catch (err) {
      handleError(res, err);
    }
  },
);

/**
 * GET /api/v1/markets/recommendations
 * Query params: ?crop=wheat&latitude=28.6&longitude=77.2
 */
router.get(
  '/recommendations',
  requirePermissions(Permission.MARKET_VIEW),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const crop = req.query.crop as string | undefined;
      const latitude = req.query.latitude as string | undefined;
      const longitude = req.query.longitude as string | undefined;

      if (!crop) {
        res.status(400).json({ error: 'Query parameter "crop" is required.' });
        return;
      }

      if (!latitude || !longitude) {
        res.status(400).json({ error: 'Query parameters "latitude" and "longitude" are required.' });
        return;
      }

      const lat = parseFloat(latitude);
      const lon = parseFloat(longitude);

      if (isNaN(lat) || isNaN(lon)) {
        res.status(400).json({ error: 'Invalid latitude or longitude values.' });
        return;
      }

      const result = await marketIntelligence.getRecommendations(
        crop,
        { latitude: lat, longitude: lon },
        user.tenant_id,
      );
      res.json(result);
    } catch (err) {
      handleError(res, err);
    }
  },
);

function handleError(res: Response, err: unknown) {
  if (err instanceof MarketError) {
    res.status(err.statusCode).json({ error: err.message });
  } else {
    console.error('Market route error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
}

export default router;
