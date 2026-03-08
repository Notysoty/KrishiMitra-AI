import { Router, Response } from 'express';
import { MarketService, MarketIntelligence, PriceForecaster, MarketError } from '../services/market';
import { AlertDeliveryService } from '../services/alert/AlertDeliveryService';
import { authenticate, AuthenticatedRequest } from '../middleware/authenticate';
import { requirePermissions, Permission } from '../middleware/rbac';

const router = Router();
const marketService = new MarketService();
const marketIntelligence = new MarketIntelligence(marketService);
const priceForecaster = new PriceForecaster(marketService);
const alertDeliveryService = new AlertDeliveryService();

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

/**
 * GET /api/v1/markets/forecast
 * Query params: ?crop=wheat&days=14
 */
router.get(
  '/forecast',
  requirePermissions(Permission.MARKET_VIEW),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const crop = req.query.crop as string | undefined;
      const daysParam = req.query.days as string | undefined;

      if (!crop) {
        res.status(400).json({ error: 'Query parameter "crop" is required.' });
        return;
      }

      let days = 14;
      if (daysParam) {
        days = parseInt(daysParam, 10);
        if (isNaN(days) || days < 1 || days > 30) {
          res.status(400).json({ error: 'Query parameter "days" must be between 1 and 30.' });
          return;
        }
      }

      const result = await priceForecaster.forecast(crop, user.tenant_id, days);
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

/**
 * POST /api/v1/markets/alerts
 * Body: { crop, market, condition, threshold }
 */
router.post(
  '/alerts',
  requirePermissions(Permission.MARKET_ALERTS_MANAGE),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const { crop, market, condition, threshold } = req.body;

      if (!crop || !market || !condition || threshold === undefined) {
        res.status(400).json({ error: 'Fields "crop", "market", "condition", and "threshold" are required.' });
        return;
      }

      if (condition !== 'above' && condition !== 'below') {
        res.status(400).json({ error: 'Field "condition" must be "above" or "below".' });
        return;
      }

      const numThreshold = parseFloat(threshold);
      if (isNaN(numThreshold) || numThreshold <= 0) {
        res.status(400).json({ error: 'Field "threshold" must be a positive number.' });
        return;
      }

      const alert = await alertDeliveryService.createPriceAlert(user.id, {
        crop,
        market,
        condition,
        threshold: numThreshold,
      });
      res.status(201).json(alert);
    } catch (err) {
      handleError(res, err);
    }
  },
);

/**
 * GET /api/v1/markets/alerts
 */
router.get(
  '/alerts',
  requirePermissions(Permission.MARKET_ALERTS_MANAGE),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const alerts = await alertDeliveryService.getPriceAlerts(user.id);
      res.json({ alerts });
    } catch (err) {
      handleError(res, err);
    }
  },
);

/**
 * POST /api/v1/markets/negotiate
 * Body: { crop, market, offeredPrice, farmerState? }
 * Returns AI-powered mandi price negotiation advice.
 */
router.post(
  '/negotiate',
  requirePermissions(Permission.MARKET_VIEW),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { crop, market, offeredPrice, farmerState } = req.body as {
        crop: string;
        market: string;
        offeredPrice: number;
        farmerState?: string;
      };

      if (!crop || !market || offeredPrice == null) {
        res.status(400).json({ error: 'crop, market, and offeredPrice are required.' });
        return;
      }

      // Fetch current prices for this crop across available markets
      const result = await marketService.getPrices(crop, farmerState);
      const prices = result.prices;

      // Find the current price at the offered market (unit: ₹/quintal → ₹/kg = /100)
      const marketEntry = prices.find(
        (p) => p.market_name.toLowerCase().includes(market.toLowerCase()),
      );
      const bestEntry = prices.length > 0
        ? prices.reduce((best, p) => (p.price > best.price ? p : best), prices[0])
        : undefined;

      // prices are in ₹/quintal; convert to ₹/kg
      const currentAtMarket = marketEntry ? marketEntry.price / 100 : offeredPrice;
      const priceDiff = ((currentAtMarket - offeredPrice) / offeredPrice) * 100;
      const bestKg = bestEntry ? bestEntry.price / 100 : offeredPrice;
      const bestPriceDiff = ((bestKg - offeredPrice) / offeredPrice) * 100;

      let verdict: string;
      let advice: string;

      if (priceDiff >= -5) {
        verdict = 'fair';
        advice = `₹${offeredPrice}/kg at ${market} is close to the current market rate (₹${currentAtMarket.toFixed(1)}/kg). This is a fair price.`;
      } else if (priceDiff < -15) {
        verdict = 'low';
        advice = `₹${offeredPrice}/kg is significantly below the current market rate (₹${currentAtMarket.toFixed(1)}/kg) for ${crop} at ${market}. Try negotiating for at least ₹${Math.round(currentAtMarket * 0.95)}/kg.`;
      } else {
        verdict = 'slightly_low';
        advice = `₹${offeredPrice}/kg is slightly below the market rate (₹${currentAtMarket.toFixed(1)}/kg). You may be able to negotiate a small increase.`;
      }

      if (bestEntry && bestPriceDiff > 15 && bestEntry.market_name !== market) {
        advice += ` Better price available: ${bestEntry.market_name} is currently paying ₹${bestKg.toFixed(1)}/kg. Check transport costs before switching.`;
      }

      res.json({
        verdict,
        offeredPrice,
        currentMarketPrice: parseFloat(currentAtMarket.toFixed(2)),
        bestAvailablePrice: bestKg ? parseFloat(bestKg.toFixed(2)) : undefined,
        bestMarket: bestEntry?.market_name,
        advice,
        comparisons: prices.slice(0, 5).map((p) => ({ market: p.market_name, price_per_kg: parseFloat((p.price / 100).toFixed(2)) })),
      });
    } catch (err) {
      handleError(res, err);
    }
  },
);

export default router;
