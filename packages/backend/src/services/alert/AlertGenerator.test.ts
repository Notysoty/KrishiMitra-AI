import {
  AlertGenerator,
  PriceAlertConfig,
  WeatherForecastDay,
  FarmInfo,
  SEVERE_RAINFALL_MM,
  SEVERE_TEMPERATURE_C,
  BATCH_WINDOW_HOURS,
} from './AlertGenerator';
import { AlertType, AlertPriority, AlertStatus } from '../../types/enums';

// ── Mock pg Pool ───────────────────────────────────────────────
const mockQuery = jest.fn();

jest.mock('../../db/pool', () => ({
  getPool: () => ({ query: mockQuery }),
}));

// ── Mock crypto.randomUUID ─────────────────────────────────────
let uuidCounter = 0;
jest.spyOn(global.crypto, 'randomUUID').mockImplementation(
  () => `test-uuid-${++uuidCounter}` as `${string}-${string}-${string}-${string}-${string}`,
);

describe('AlertGenerator', () => {
  let generator: AlertGenerator;

  beforeEach(() => {
    generator = new AlertGenerator();
    mockQuery.mockReset();
    uuidCounter = 0;
  });

  // ── shouldTriggerCustom ──────────────────────────────────────

  describe('shouldTriggerCustom', () => {
    const baseConfig: PriceAlertConfig = {
      id: 'pa-1',
      user_id: 'user-1',
      crop: 'wheat',
      market: 'Azadpur Mandi',
      condition: 'above',
      threshold: 30,
    };

    it('should trigger when price is above threshold', () => {
      expect(generator.shouldTriggerCustom(baseConfig, 35)).toBe(true);
    });

    it('should not trigger when price is at threshold', () => {
      expect(generator.shouldTriggerCustom(baseConfig, 30)).toBe(false);
    });

    it('should not trigger when price is below threshold for above condition', () => {
      expect(generator.shouldTriggerCustom(baseConfig, 25)).toBe(false);
    });

    it('should trigger when price is below threshold for below condition', () => {
      const belowConfig = { ...baseConfig, condition: 'below' as const };
      expect(generator.shouldTriggerCustom(belowConfig, 25)).toBe(true);
    });

    it('should not trigger when price is above threshold for below condition', () => {
      const belowConfig = { ...baseConfig, condition: 'below' as const };
      expect(generator.shouldTriggerCustom(belowConfig, 35)).toBe(false);
    });
  });

  // ── getPriceActionAdvice ─────────────────────────────────────

  describe('getPriceActionAdvice', () => {
    it('should advise selling for above condition', () => {
      const config: PriceAlertConfig = {
        id: 'pa-1', user_id: 'u1', crop: 'wheat',
        market: 'M1', condition: 'above', threshold: 30,
      };
      const advice = generator.getPriceActionAdvice(config, 35);
      expect(advice).toContain('selling');
    });

    it('should advise holding for below condition', () => {
      const config: PriceAlertConfig = {
        id: 'pa-1', user_id: 'u1', crop: 'wheat',
        market: 'M1', condition: 'below', threshold: 30,
      };
      const advice = generator.getPriceActionAdvice(config, 25);
      expect(advice).toContain('hold');
    });
  });

  // ── createAlertRecord ────────────────────────────────────────

  describe('createAlertRecord', () => {
    it('should insert alert into database and return mapped Alert', async () => {
      const now = new Date();
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'test-uuid-1',
          user_id: 'user-1',
          type: AlertType.PRICE_CHANGE,
          title: 'wheat price alert',
          message: 'Price up',
          priority: AlertPriority.MEDIUM,
          status: AlertStatus.UNREAD,
          data: '{}',
          created_at: now.toISOString(),
        }],
      });

      const alert = await generator.createAlertRecord({
        user_id: 'user-1',
        type: AlertType.PRICE_CHANGE,
        title: 'wheat price alert',
        message: 'Price up',
        priority: AlertPriority.MEDIUM,
      });

      expect(alert.id).toBe('test-uuid-1');
      expect(alert.type).toBe(AlertType.PRICE_CHANGE);
      expect(alert.status).toBe(AlertStatus.UNREAD);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO alerts'),
        expect.arrayContaining(['user-1', AlertType.PRICE_CHANGE]),
      );
    });
  });

  // ── isDismissedRecently ──────────────────────────────────────

  describe('isDismissedRecently', () => {
    it('should return true when dismissed alert exists within 48 hours', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '1' }] });

      const result = await generator.isDismissedRecently(
        'user-1', AlertType.PRICE_CHANGE, 'wheat',
      );
      expect(result).toBe(true);
    });

    it('should return false when no dismissed alert exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const result = await generator.isDismissedRecently(
        'user-1', AlertType.PRICE_CHANGE, 'wheat',
      );
      expect(result).toBe(false);
    });
  });

  // ── checkPriceAlerts ─────────────────────────────────────────

  describe('checkPriceAlerts', () => {
    it('should trigger alert when custom threshold is crossed', async () => {
      // getActivePriceAlerts
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'pa-1', user_id: 'user-1', crop: 'wheat',
          market: 'Azadpur Mandi', condition: 'above', threshold: 30,
        }],
      });
      // getCurrentPrices
      mockQuery.mockResolvedValueOnce({
        rows: [{ crop: 'wheat', market_name: 'Azadpur Mandi', price: 35, date: new Date() }],
      });
      // isDismissedRecently
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      // createAlertRecord (INSERT)
      const now = new Date();
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'test-uuid-1', user_id: 'user-1', type: AlertType.PRICE_CHANGE,
          title: 'wheat price alert', message: 'wheat price is now ₹35.00/kg',
          priority: AlertPriority.MEDIUM, status: AlertStatus.UNREAD,
          data: '{}', created_at: now.toISOString(),
        }],
      });
      // detectSignificantPriceChanges
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const alerts = await generator.checkPriceAlerts();
      expect(alerts).toHaveLength(1);
      expect(alerts[0].type).toBe(AlertType.PRICE_CHANGE);
    });

    it('should suppress dismissed alerts for 48 hours', async () => {
      // getActivePriceAlerts
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'pa-1', user_id: 'user-1', crop: 'wheat',
          market: 'Azadpur Mandi', condition: 'above', threshold: 30,
        }],
      });
      // getCurrentPrices
      mockQuery.mockResolvedValueOnce({
        rows: [{ crop: 'wheat', market_name: 'Azadpur Mandi', price: 35, date: new Date() }],
      });
      // isDismissedRecently → true (suppressed)
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '1' }] });
      // detectSignificantPriceChanges
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const alerts = await generator.checkPriceAlerts();
      expect(alerts).toHaveLength(0);
    });

    it('should not trigger when price does not cross threshold', async () => {
      // getActivePriceAlerts
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'pa-1', user_id: 'user-1', crop: 'wheat',
          market: 'Azadpur Mandi', condition: 'above', threshold: 30,
        }],
      });
      // getCurrentPrices
      mockQuery.mockResolvedValueOnce({
        rows: [{ crop: 'wheat', market_name: 'Azadpur Mandi', price: 25, date: new Date() }],
      });
      // detectSignificantPriceChanges
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const alerts = await generator.checkPriceAlerts();
      expect(alerts).toHaveLength(0);
    });

    it('should trigger alert for >15% price change in 7 days', async () => {
      // getActivePriceAlerts
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // getCurrentPrices
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // detectSignificantPriceChanges
      mockQuery.mockResolvedValueOnce({
        rows: [{
          user_id: 'user-1', crop: 'tomato', market_name: 'Vashi Market',
          current_price: 40, previous_price: 30, change_percent: 33.3,
        }],
      });
      // isDismissedRecently
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      // createAlertRecord
      const now = new Date();
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'test-uuid-1', user_id: 'user-1', type: AlertType.PRICE_CHANGE,
          title: 'tomato price up 33.3%', message: 'Prices moved up',
          priority: AlertPriority.MEDIUM, status: AlertStatus.UNREAD,
          data: '{}', created_at: now.toISOString(),
        }],
      });

      const alerts = await generator.checkPriceAlerts();
      expect(alerts).toHaveLength(1);
      expect(alerts[0].type).toBe(AlertType.PRICE_CHANGE);
    });
  });

  // ── checkWeatherAlerts ───────────────────────────────────────

  describe('checkWeatherAlerts', () => {
    const farms: FarmInfo[] = [
      { id: 'farm-1', user_id: 'user-1', location: { latitude: 28.7, longitude: 77.1 } },
    ];

    function makeForecast(overrides: Partial<WeatherForecastDay> = {}): WeatherForecastDay {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      return {
        date: tomorrow.toISOString().split('T')[0],
        rainfall: 20,
        temperature: 30,
        ...overrides,
      };
    }

    it('should trigger alert for heavy rainfall >100mm', async () => {
      const forecasts = new Map<string, WeatherForecastDay[]>();
      forecasts.set('farm-1', [makeForecast({ rainfall: 120 })]);

      // isDismissedRecently
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      // createAlertRecord
      const now = new Date();
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'test-uuid-1', user_id: 'user-1', type: AlertType.WEATHER,
          title: 'Heavy rainfall alert', message: 'Heavy rain expected',
          priority: AlertPriority.HIGH, status: AlertStatus.UNREAD,
          data: '{}', created_at: now.toISOString(),
        }],
      });

      const alerts = await generator.checkWeatherAlerts(farms, forecasts);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].type).toBe(AlertType.WEATHER);
      expect(alerts[0].priority).toBe(AlertPriority.HIGH);
    });

    it('should trigger alert for temperature >40°C', async () => {
      const forecasts = new Map<string, WeatherForecastDay[]>();
      forecasts.set('farm-1', [makeForecast({ temperature: 42 })]);

      // isDismissedRecently
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      // createAlertRecord
      const now = new Date();
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'test-uuid-1', user_id: 'user-1', type: AlertType.WEATHER,
          title: 'Heat wave alert', message: 'High temperature expected',
          priority: AlertPriority.HIGH, status: AlertStatus.UNREAD,
          data: '{}', created_at: now.toISOString(),
        }],
      });

      const alerts = await generator.checkWeatherAlerts(farms, forecasts);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].title).toBe('Heat wave alert');
    });

    it('should not trigger for normal weather', async () => {
      const forecasts = new Map<string, WeatherForecastDay[]>();
      forecasts.set('farm-1', [makeForecast({ rainfall: 20, temperature: 30 })]);

      const alerts = await generator.checkWeatherAlerts(farms, forecasts);
      expect(alerts).toHaveLength(0);
    });

    it('should send emergency alert for extreme rainfall (>150mm)', async () => {
      const forecasts = new Map<string, WeatherForecastDay[]>();
      forecasts.set('farm-1', [makeForecast({ rainfall: 160 })]);

      // isDismissedRecently
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      // createAlertRecord (emergency bypasses batching)
      const now = new Date();
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'test-uuid-1', user_id: 'user-1', type: AlertType.WEATHER,
          title: 'Heavy rainfall alert', message: 'Heavy rain expected',
          priority: AlertPriority.HIGH, status: AlertStatus.UNREAD,
          data: JSON.stringify({ emergency: true, sent_within_30min: true }),
          created_at: now.toISOString(),
        }],
      });

      const alerts = await generator.checkWeatherAlerts(farms, forecasts);
      expect(alerts).toHaveLength(1);
    });

    it('should send emergency alert for extreme temperature (>45°C)', async () => {
      const forecasts = new Map<string, WeatherForecastDay[]>();
      forecasts.set('farm-1', [makeForecast({ temperature: 46 })]);

      // isDismissedRecently
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      // createAlertRecord (emergency)
      const now = new Date();
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'test-uuid-1', user_id: 'user-1', type: AlertType.WEATHER,
          title: 'Heat wave alert', message: 'High temperature expected',
          priority: AlertPriority.HIGH, status: AlertStatus.UNREAD,
          data: JSON.stringify({ emergency: true, sent_within_30min: true }),
          created_at: now.toISOString(),
        }],
      });

      const alerts = await generator.checkWeatherAlerts(farms, forecasts);
      expect(alerts).toHaveLength(1);
    });

    it('should suppress dismissed weather alerts for 48 hours', async () => {
      const forecasts = new Map<string, WeatherForecastDay[]>();
      forecasts.set('farm-1', [makeForecast({ rainfall: 120 })]);

      // isDismissedRecently → true
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '1' }] });

      const alerts = await generator.checkWeatherAlerts(farms, forecasts);
      expect(alerts).toHaveLength(0);
    });

    it('should skip farms with no forecast data', async () => {
      const forecasts = new Map<string, WeatherForecastDay[]>();
      // No forecast for farm-1

      const alerts = await generator.checkWeatherAlerts(farms, forecasts);
      expect(alerts).toHaveLength(0);
    });

    it('should trigger multiple alerts for multiple severe conditions', async () => {
      const forecasts = new Map<string, WeatherForecastDay[]>();
      forecasts.set('farm-1', [
        makeForecast({ rainfall: 120, temperature: 42 }),
      ]);

      // isDismissedRecently for rainfall
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      // createAlertRecord for rainfall
      const now = new Date();
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'test-uuid-1', user_id: 'user-1', type: AlertType.WEATHER,
          title: 'Heavy rainfall alert', message: 'Heavy rain',
          priority: AlertPriority.HIGH, status: AlertStatus.UNREAD,
          data: '{}', created_at: now.toISOString(),
        }],
      });
      // isDismissedRecently for temperature
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      // createAlertRecord for temperature — but this goes to batch queue
      // since lastBatchFlush was just set by the rainfall alert

      const alerts = await generator.checkWeatherAlerts(farms, forecasts);
      // First alert triggers immediately, second goes to batch
      expect(alerts).toHaveLength(1);
    });
  });

  // ── Batching ─────────────────────────────────────────────────

  describe('batching', () => {
    it('should trigger first alert immediately', async () => {
      const now = new Date();
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'test-uuid-1', user_id: 'user-1', type: AlertType.PRICE_CHANGE,
          title: 'Alert 1', message: 'msg', priority: AlertPriority.MEDIUM,
          status: AlertStatus.UNREAD, data: '{}', created_at: now.toISOString(),
        }],
      });

      const alert = await generator.enqueueOrTrigger({
        user_id: 'user-1',
        type: AlertType.PRICE_CHANGE,
        title: 'Alert 1',
        message: 'msg',
        priority: AlertPriority.MEDIUM,
      });

      expect(alert).not.toBeNull();
      expect(alert!.title).toBe('Alert 1');
    });

    it('should batch subsequent alerts within 24 hours', async () => {
      // First alert triggers immediately
      const now = new Date();
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'test-uuid-1', user_id: 'user-1', type: AlertType.PRICE_CHANGE,
          title: 'Alert 1', message: 'msg', priority: AlertPriority.MEDIUM,
          status: AlertStatus.UNREAD, data: '{}', created_at: now.toISOString(),
        }],
      });

      await generator.enqueueOrTrigger({
        user_id: 'user-1',
        type: AlertType.PRICE_CHANGE,
        title: 'Alert 1',
        message: 'msg',
        priority: AlertPriority.MEDIUM,
      });

      // Second alert should be batched
      const alert2 = await generator.enqueueOrTrigger({
        user_id: 'user-1',
        type: AlertType.PRICE_CHANGE,
        title: 'Alert 2',
        message: 'msg2',
        priority: AlertPriority.MEDIUM,
      });

      expect(alert2).toBeNull();
    });

    it('should flush batched alerts as summary', async () => {
      // First alert triggers immediately
      const now = new Date();
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'test-uuid-1', user_id: 'user-1', type: AlertType.PRICE_CHANGE,
          title: 'Alert 1', message: 'msg', priority: AlertPriority.MEDIUM,
          status: AlertStatus.UNREAD, data: '{}', created_at: now.toISOString(),
        }],
      });

      await generator.enqueueOrTrigger({
        user_id: 'user-1',
        type: AlertType.PRICE_CHANGE,
        title: 'Alert 1',
        message: 'msg',
        priority: AlertPriority.MEDIUM,
      });

      // Batch second alert
      await generator.enqueueOrTrigger({
        user_id: 'user-1',
        type: AlertType.PRICE_CHANGE,
        title: 'Alert 2',
        message: 'msg2',
        priority: AlertPriority.MEDIUM,
      });

      // Flush
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'test-uuid-2', user_id: 'user-1', type: AlertType.PRICE_CHANGE,
          title: 'Alert summary (1 alerts)', message: 'summary',
          priority: AlertPriority.MEDIUM, status: AlertStatus.UNREAD,
          data: JSON.stringify({ batched: true, alert_count: 1 }),
          created_at: now.toISOString(),
        }],
      });

      const summary = await generator.flushBatchedAlerts('user-1');
      expect(summary).not.toBeNull();
      expect(summary!.title).toContain('summary');
    });

    it('should return null when flushing empty batch', async () => {
      const summary = await generator.flushBatchedAlerts('user-1');
      expect(summary).toBeNull();
    });
  });

  // ── triggerEmergencyAlert ────────────────────────────────────

  describe('triggerEmergencyAlert', () => {
    it('should create alert immediately with emergency flag', async () => {
      const now = new Date();
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'test-uuid-1', user_id: 'user-1', type: AlertType.WEATHER,
          title: 'Emergency', message: 'Severe weather',
          priority: AlertPriority.HIGH, status: AlertStatus.UNREAD,
          data: JSON.stringify({ emergency: true, sent_within_30min: true }),
          created_at: now.toISOString(),
        }],
      });

      const alert = await generator.triggerEmergencyAlert({
        user_id: 'user-1',
        type: AlertType.WEATHER,
        title: 'Emergency',
        message: 'Severe weather',
        priority: AlertPriority.HIGH,
        data: { farm_id: 'farm-1' },
      });

      expect(alert.id).toBe('test-uuid-1');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO alerts'),
        expect.any(Array),
      );
    });
  });

  // ── Alert message content ────────────────────────────────────

  describe('alert messages include actionable information', () => {
    it('price alert message includes price and action advice', async () => {
      // getActivePriceAlerts
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'pa-1', user_id: 'user-1', crop: 'tomato',
          market: 'Vashi Market', condition: 'above', threshold: 25,
        }],
      });
      // getCurrentPrices
      mockQuery.mockResolvedValueOnce({
        rows: [{ crop: 'tomato', market_name: 'Vashi Market', price: 35, date: new Date() }],
      });
      // isDismissedRecently
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
      // createAlertRecord
      const now = new Date();
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'test-uuid-1', user_id: 'user-1', type: AlertType.PRICE_CHANGE,
          title: 'tomato price alert',
          message: 'tomato price is now ₹35.00/kg at Vashi Market. Consider selling soon to lock in the higher price.',
          priority: AlertPriority.MEDIUM, status: AlertStatus.UNREAD,
          data: '{}', created_at: now.toISOString(),
        }],
      });
      // detectSignificantPriceChanges
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const alerts = await generator.checkPriceAlerts();
      expect(alerts).toHaveLength(1);

      // Verify the INSERT was called with actionable message
      const insertCall = mockQuery.mock.calls.find(
        (call: unknown[]) => typeof call[0] === 'string' && (call[0] as string).includes('INSERT INTO alerts'),
      );
      expect(insertCall).toBeDefined();
      const messageArg = (insertCall![1] as unknown[])[4] as string;
      expect(messageArg).toContain('₹35.00/kg');
      expect(messageArg).toContain('selling');
    });
  });
});
