import { Router, Response } from 'express';
import { AlertDeliveryService } from '../services/alert/AlertDeliveryService';
import { PestAlertService } from '../services/alert/PestAlertService';
import { authenticate, AuthenticatedRequest } from '../middleware/authenticate';
import { requirePermissions, Permission } from '../middleware/rbac';
import { AlertStatus, AlertType } from '../types/enums';

const pestAlertService = new PestAlertService();

const router = Router();
const deliveryService = new AlertDeliveryService();

// All alert routes require authentication
router.use(authenticate);

/**
 * GET /api/v1/alerts
 * Query params: ?status=unread&type=price_change&limit=50&offset=0
 */
router.get(
  '/',
  requirePermissions(Permission.ALERTS_VIEW),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const status = req.query.status as AlertStatus | undefined;
      const type = req.query.type as AlertType | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
      const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : undefined;

      if (status && !Object.values(AlertStatus).includes(status)) {
        res.status(400).json({ error: 'Invalid status value.' });
        return;
      }
      if (type && !Object.values(AlertType).includes(type)) {
        res.status(400).json({ error: 'Invalid type value.' });
        return;
      }

      const result = await deliveryService.getAlerts(user.id, { status, type, limit, offset });
      res.json(result);
    } catch (err) {
      handleError(res, err);
    }
  },
);

/**
 * POST /api/v1/alerts/preferences
 * Body: { in_app?: boolean, sms?: boolean, email?: boolean, price_alerts?: boolean, weather_alerts?: boolean, pest_alerts?: boolean }
 */
router.post(
  '/preferences',
  requirePermissions(Permission.ALERTS_MANAGE_PREFS),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const { in_app, sms, email, price_alerts, weather_alerts, pest_alerts } = req.body;

      const updates: Record<string, boolean> = {};
      if (typeof in_app === 'boolean') updates.in_app = in_app;
      if (typeof sms === 'boolean') updates.sms = sms;
      if (typeof email === 'boolean') updates.email = email;
      if (typeof price_alerts === 'boolean') updates.price_alerts = price_alerts;
      if (typeof weather_alerts === 'boolean') updates.weather_alerts = weather_alerts;
      if (typeof pest_alerts === 'boolean') updates.pest_alerts = pest_alerts;

      const preferences = await deliveryService.updatePreferences(user.id, updates);
      res.json(preferences);
    } catch (err) {
      handleError(res, err);
    }
  },
);

/**
 * PUT /api/v1/alerts/:id/acknowledge
 */
router.put(
  '/:id/acknowledge',
  requirePermissions(Permission.ALERTS_VIEW),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const alertId = req.params.id;

      const alert = await deliveryService.acknowledgeAlert(alertId, user.id);
      if (!alert) {
        res.status(404).json({ error: 'Alert not found.' });
        return;
      }

      res.json(alert);
    } catch (err) {
      handleError(res, err);
    }
  },
);

/**
 * GET /api/v1/alerts/history
 * Query params: ?days=30&limit=50&offset=0
 */
router.get(
  '/history',
  requirePermissions(Permission.ALERTS_VIEW),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const days = req.query.days ? parseInt(req.query.days as string, 10) : undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
      const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : undefined;

      if (days !== undefined && (isNaN(days) || days < 1 || days > 365)) {
        res.status(400).json({ error: 'Query parameter "days" must be between 1 and 365.' });
        return;
      }

      const result = await deliveryService.getAlertHistory(user.id, { days, limit, offset });
      res.json(result);
    } catch (err) {
      handleError(res, err);
    }
  },
);

/**
 * GET /api/v1/alerts/pest-advisories?crop=tomato&state=Maharashtra
 * Returns seasonal pest advisories for a crop (no auth required for quick lookup).
 */
router.get('/pest-advisories', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const crop = (req.query.crop as string) ?? '';
    const state = (req.query.state as string) ?? '';
    if (!crop) {
      res.status(400).json({ error: 'crop query param is required' });
      return;
    }
    const advisories = pestAlertService.getAdvisoriesForCrop(crop, state);
    res.json({ advisories });
  } catch (err) {
    handleError(res, err);
  }
});

/**
 * POST /api/v1/alerts/push-subscribe
 * Body: { endpoint, keys: { p256dh, auth } }
 * Saves a Web Push subscription for the authenticated user.
 */
router.post(
  '/push-subscribe',
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const user = req.user!;
      const { endpoint, keys } = req.body;
      if (!endpoint || !keys?.p256dh || !keys?.auth) {
        res.status(400).json({ error: 'endpoint, keys.p256dh, and keys.auth are required.' });
        return;
      }
      await deliveryService.saveWebPushSubscription(user.id, { endpoint, keys });
      res.json({ success: true });
    } catch (err) {
      handleError(res, err);
    }
  },
);

/**
 * GET /api/v1/alerts/vapid-public-key
 * Returns the VAPID public key so the frontend can subscribe to push.
 */
router.get('/vapid-public-key', (_req, res: Response) => {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) {
    res.status(503).json({ error: 'Push notifications not configured on this server.' });
    return;
  }
  res.json({ publicKey: key });
});

function handleError(res: Response, err: unknown) {
  console.error('Alert route error:', err);
  res.status(500).json({ error: 'Internal server error.' });
}

export default router;
