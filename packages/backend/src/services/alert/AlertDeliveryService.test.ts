import {
  AlertDeliveryService,
  DEFAULT_PREFERENCES,
  DeliveryRecord,
} from './AlertDeliveryService';
import { AlertType, AlertPriority, AlertStatus } from '../../types/enums';
import { Alert, AlertPreferences } from '../../types/alert';

// ── Mock pg Pool ───────────────────────────────────────────────
const mockQuery = jest.fn();

jest.mock('../../db/pool', () => ({
  getPool: () => ({ query: mockQuery }),
}));

let uuidCounter = 0;
jest.spyOn(global.crypto, 'randomUUID').mockImplementation(
  () => `test-uuid-${++uuidCounter}` as `${string}-${string}-${string}-${string}-${string}`,
);

describe('AlertDeliveryService', () => {
  let service: AlertDeliveryService;

  beforeEach(() => {
    service = new AlertDeliveryService();
    mockQuery.mockReset();
    uuidCounter = 0;
  });

  // ── getPreferences ──────────────────────────────────────────

  describe('getPreferences', () => {
    it('should return default preferences when none exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const prefs = await service.getPreferences('user-1');
      expect(prefs.user_id).toBe('user-1');
      expect(prefs.in_app).toBe(true);
      expect(prefs.sms).toBe(false);
      expect(prefs.email).toBe(false);
      expect(prefs.price_alerts).toBe(true);
      expect(prefs.weather_alerts).toBe(true);
      expect(prefs.pest_alerts).toBe(true);
    });

    it('should return stored preferences when they exist', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          user_id: 'user-1',
          in_app: true,
          sms: true,
          email: false,
          price_alerts: true,
          weather_alerts: false,
          pest_alerts: true,
        }],
      });

      const prefs = await service.getPreferences('user-1');
      expect(prefs.sms).toBe(true);
      expect(prefs.weather_alerts).toBe(false);
    });
  });

  // ── updatePreferences ───────────────────────────────────────

  describe('updatePreferences', () => {
    it('should upsert preferences and return merged result', async () => {
      // getPreferences (no existing)
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // upsert
      mockQuery.mockResolvedValueOnce({
        rows: [{
          user_id: 'user-1',
          in_app: true,
          sms: true,
          email: false,
          price_alerts: true,
          weather_alerts: true,
          pest_alerts: true,
        }],
      });

      const prefs = await service.updatePreferences('user-1', { sms: true });
      expect(prefs.sms).toBe(true);
      expect(prefs.in_app).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO alert_preferences'),
        expect.arrayContaining(['user-1']),
      );
    });

    it('should merge partial updates with existing preferences', async () => {
      // getPreferences (existing)
      mockQuery.mockResolvedValueOnce({
        rows: [{
          user_id: 'user-1',
          in_app: true,
          sms: false,
          email: true,
          price_alerts: true,
          weather_alerts: true,
          pest_alerts: false,
        }],
      });
      // upsert
      mockQuery.mockResolvedValueOnce({
        rows: [{
          user_id: 'user-1',
          in_app: true,
          sms: true,
          email: true,
          price_alerts: true,
          weather_alerts: true,
          pest_alerts: false,
        }],
      });

      const prefs = await service.updatePreferences('user-1', { sms: true });
      expect(prefs.sms).toBe(true);
      expect(prefs.email).toBe(true);
      expect(prefs.pest_alerts).toBe(false);
    });
  });

  // ── deliverAlert ────────────────────────────────────────────

  describe('deliverAlert', () => {
    const baseAlert: Alert = {
      id: 'alert-1',
      user_id: 'user-1',
      type: AlertType.PRICE_CHANGE,
      title: 'Price alert',
      message: 'Wheat price up',
      priority: AlertPriority.MEDIUM,
      status: AlertStatus.UNREAD,
      created_at: new Date(),
    };

    it('should deliver via in-app only by default', async () => {
      // getPreferences returns defaults
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const records = await service.deliverAlert(baseAlert);
      expect(records).toHaveLength(1);
      expect(records[0].channel).toBe('in_app');
      expect(records[0].status).toBe('sent');
    });

    it('should deliver via multiple channels when enabled', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          user_id: 'user-1',
          in_app: true,
          sms: true,
          email: true,
          price_alerts: true,
          weather_alerts: true,
          pest_alerts: true,
        }],
      });

      const records = await service.deliverAlert(baseAlert);
      expect(records).toHaveLength(3);
      expect(records.map(r => r.channel).sort()).toEqual(['email', 'in_app', 'sms']);
    });

    it('should skip delivery when alert type is disabled', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          user_id: 'user-1',
          in_app: true,
          sms: true,
          email: false,
          price_alerts: false,
          weather_alerts: true,
          pest_alerts: true,
        }],
      });

      const records = await service.deliverAlert(baseAlert);
      expect(records).toHaveLength(0);
    });

    it('should deliver weather alerts when weather_alerts is enabled', async () => {
      const weatherAlert: Alert = { ...baseAlert, type: AlertType.WEATHER };
      mockQuery.mockResolvedValueOnce({
        rows: [{
          user_id: 'user-1',
          in_app: true,
          sms: false,
          email: false,
          price_alerts: false,
          weather_alerts: true,
          pest_alerts: false,
        }],
      });

      const records = await service.deliverAlert(weatherAlert);
      expect(records).toHaveLength(1);
      expect(records[0].channel).toBe('in_app');
    });
  });

  // ── getAlerts ───────────────────────────────────────────────

  describe('getAlerts', () => {
    it('should return alerts with total count', async () => {
      const now = new Date();
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: '2' }] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'a1', user_id: 'user-1', type: AlertType.PRICE_CHANGE,
              title: 'Alert 1', message: 'msg', priority: AlertPriority.MEDIUM,
              status: AlertStatus.UNREAD, created_at: now.toISOString(),
              data: '{}',
            },
            {
              id: 'a2', user_id: 'user-1', type: AlertType.WEATHER,
              title: 'Alert 2', message: 'msg2', priority: AlertPriority.HIGH,
              status: AlertStatus.READ, created_at: now.toISOString(),
              data: null,
            },
          ],
        });

      const result = await service.getAlerts('user-1');
      expect(result.total).toBe(2);
      expect(result.alerts).toHaveLength(2);
      expect(result.alerts[0].id).toBe('a1');
    });

    it('should filter by status and type', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: '1' }] })
        .mockResolvedValueOnce({
          rows: [{
            id: 'a1', user_id: 'user-1', type: AlertType.PRICE_CHANGE,
            title: 'Alert', message: 'msg', priority: AlertPriority.MEDIUM,
            status: AlertStatus.UNREAD, created_at: new Date().toISOString(),
            data: '{}',
          }],
        });

      const result = await service.getAlerts('user-1', {
        status: AlertStatus.UNREAD,
        type: AlertType.PRICE_CHANGE,
      });
      expect(result.total).toBe(1);

      // Verify query includes status and type filters
      const countCall = mockQuery.mock.calls[0];
      expect(countCall[0]).toContain('status');
      expect(countCall[0]).toContain('type');
    });
  });

  // ── acknowledgeAlert ────────────────────────────────────────

  describe('acknowledgeAlert', () => {
    it('should update alert status to acknowledged', async () => {
      const now = new Date();
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'alert-1', user_id: 'user-1', type: AlertType.PRICE_CHANGE,
          title: 'Alert', message: 'msg', priority: AlertPriority.MEDIUM,
          status: AlertStatus.ACKNOWLEDGED, created_at: now.toISOString(),
          acknowledged_at: now.toISOString(), data: '{}',
        }],
      });

      const alert = await service.acknowledgeAlert('alert-1', 'user-1');
      expect(alert).not.toBeNull();
      expect(alert!.status).toBe(AlertStatus.ACKNOWLEDGED);
      expect(alert!.acknowledged_at).toBeDefined();
    });

    it('should return null when alert not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const alert = await service.acknowledgeAlert('nonexistent', 'user-1');
      expect(alert).toBeNull();
    });
  });

  // ── getAlertHistory ─────────────────────────────────────────

  describe('getAlertHistory', () => {
    it('should return alerts within specified days', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ total: '1' }] })
        .mockResolvedValueOnce({
          rows: [{
            id: 'a1', user_id: 'user-1', type: AlertType.WEATHER,
            title: 'Weather', message: 'msg', priority: AlertPriority.HIGH,
            status: AlertStatus.ACKNOWLEDGED, created_at: new Date().toISOString(),
            acknowledged_at: new Date().toISOString(), data: '{}',
          }],
        });

      const result = await service.getAlertHistory('user-1', { days: 7 });
      expect(result.total).toBe(1);
      expect(result.alerts).toHaveLength(1);
    });
  });

  // ── Price Alert CRUD ────────────────────────────────────────

  describe('createPriceAlert', () => {
    it('should create a price alert config', async () => {
      const now = new Date();
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'test-uuid-1', user_id: 'user-1', crop: 'wheat',
          market: 'Azadpur Mandi', condition: 'above', threshold: 30,
          active: true, created_at: now.toISOString(),
        }],
      });

      const config = await service.createPriceAlert('user-1', {
        crop: 'wheat',
        market: 'Azadpur Mandi',
        condition: 'above',
        threshold: 30,
      });

      expect(config.id).toBe('test-uuid-1');
      expect(config.crop).toBe('wheat');
      expect(config.threshold).toBe(30);
      expect(config.active).toBe(true);
    });
  });

  describe('getPriceAlerts', () => {
    it('should return active price alerts for user', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'pa-1', user_id: 'user-1', crop: 'wheat',
            market: 'Azadpur Mandi', condition: 'above', threshold: 30,
            active: true, created_at: new Date().toISOString(),
          },
          {
            id: 'pa-2', user_id: 'user-1', crop: 'tomato',
            market: 'Vashi Market', condition: 'below', threshold: 20,
            active: true, created_at: new Date().toISOString(),
          },
        ],
      });

      const alerts = await service.getPriceAlerts('user-1');
      expect(alerts).toHaveLength(2);
      expect(alerts[0].crop).toBe('wheat');
      expect(alerts[1].condition).toBe('below');
    });

    it('should return empty array when no alerts exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const alerts = await service.getPriceAlerts('user-1');
      expect(alerts).toHaveLength(0);
    });
  });
});
