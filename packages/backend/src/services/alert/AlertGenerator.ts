import { getPool } from '../../db/pool';
import { AlertType, AlertPriority, AlertStatus } from '../../types/enums';
import { Alert } from '../../types/alert';

// ── Interfaces ──────────────────────────────────────────────────

export interface PriceAlertConfig {
  id: string;
  user_id: string;
  crop: string;
  market: string;
  condition: 'above' | 'below';
  threshold: number;
}

export interface WeatherForecastDay {
  date: string;
  rainfall: number;
  temperature: number;
  wind_speed?: number;
  description?: string;
}

export interface FarmInfo {
  id: string;
  user_id: string;
  location: { latitude: number; longitude: number };
}

export interface AlertPayload {
  user_id: string;
  type: AlertType;
  title: string;
  message: string;
  priority: AlertPriority;
  data?: Record<string, unknown>;
}

export interface PendingAlert {
  payload: AlertPayload;
  created_at: Date;
}

// ── Constants ───────────────────────────────────────────────────

const PRICE_CHANGE_THRESHOLD_PERCENT = 15;
const PRICE_LOOKBACK_DAYS = 7;
const SEVERE_RAINFALL_MM = 100;
const SEVERE_TEMPERATURE_C = 40;
const WEATHER_FORECAST_HOURS = 48;
const EMERGENCY_ALERT_WINDOW_MINUTES = 30;
const BATCH_WINDOW_HOURS = 24;
const DISMISS_SUPPRESSION_HOURS = 48;

// ── AlertGenerator ──────────────────────────────────────────────

export class AlertGenerator {
  private batchQueue: Map<string, PendingAlert[]> = new Map();
  private lastBatchFlush: Map<string, Date> = new Map();

  // ── Price Alerts ────────────────────────────────────────────

  async checkPriceAlerts(): Promise<Alert[]> {
    const triggered: Alert[] = [];
    const pool = getPool();

    // 1. Get all active custom price alert configs
    const customAlerts = await this.getActivePriceAlerts();

    // 2. Get current prices
    const currentPrices = await this.getCurrentPrices();

    // 3. Check custom threshold alerts
    for (const config of customAlerts) {
      const match = currentPrices.find(
        (p) => p.crop === config.crop && p.market_name === config.market,
      );
      if (!match) continue;

      if (this.shouldTriggerCustom(config, match.price)) {
        const payload: AlertPayload = {
          user_id: config.user_id,
          type: AlertType.PRICE_CHANGE,
          title: `${config.crop} price alert`,
          message: `${config.crop} price is now ₹${match.price.toFixed(2)}/kg at ${config.market}. ${this.getPriceActionAdvice(config, match.price)}`,
          priority: AlertPriority.MEDIUM,
          data: {
            crop: config.crop,
            market: config.market,
            price: match.price,
            threshold: config.threshold,
            condition: config.condition,
          },
        };

        const suppressed = await this.isDismissedRecently(
          config.user_id,
          AlertType.PRICE_CHANGE,
          config.crop,
        );
        if (!suppressed) {
          const alert = await this.enqueueOrTrigger(payload);
          if (alert) triggered.push(alert);
        }
      }
    }

    // 4. Check >15% change in 7 days for all crops
    const significantChanges = await this.detectSignificantPriceChanges();
    for (const change of significantChanges) {
      const suppressed = await this.isDismissedRecently(
        change.user_id,
        AlertType.PRICE_CHANGE,
        change.crop,
      );
      if (suppressed) continue;

      const direction = change.change_percent > 0 ? 'up' : 'down';
      const absChange = Math.abs(change.change_percent).toFixed(1);

      const payload: AlertPayload = {
        user_id: change.user_id,
        type: AlertType.PRICE_CHANGE,
        title: `${change.crop} price ${direction} ${absChange}%`,
        message: `${change.crop} prices moved ${direction} ${absChange}% in the last 7 days at ${change.market}. Current price: ₹${change.current_price.toFixed(2)}/kg. ${direction === 'up' ? 'Consider selling soon.' : 'You may want to hold if possible.'}`,
        priority: AlertPriority.MEDIUM,
        data: {
          crop: change.crop,
          market: change.market,
          current_price: change.current_price,
          previous_price: change.previous_price,
          change_percent: change.change_percent,
        },
      };

      const alert = await this.enqueueOrTrigger(payload);
      if (alert) triggered.push(alert);
    }

    return triggered;
  }

  // ── Weather Alerts ──────────────────────────────────────────

  async checkWeatherAlerts(
    farms: FarmInfo[],
    forecasts: Map<string, WeatherForecastDay[]>,
  ): Promise<Alert[]> {
    const triggered: Alert[] = [];

    for (const farm of farms) {
      const forecast = forecasts.get(farm.id);
      if (!forecast) continue;

      // Filter to 48-hour window
      const within48h = forecast.filter((day) => {
        const forecastDate = new Date(day.date);
        const now = new Date();
        const hoursAhead =
          (forecastDate.getTime() - now.getTime()) / (1000 * 60 * 60);
        return hoursAhead >= 0 && hoursAhead <= WEATHER_FORECAST_HOURS;
      });

      for (const day of within48h) {
        // Heavy rainfall alert
        if (day.rainfall > SEVERE_RAINFALL_MM) {
          const suppressed = await this.isDismissedRecently(
            farm.user_id,
            AlertType.WEATHER,
            `rainfall_${day.date}`,
          );
          if (suppressed) continue;

          const isEmergency = day.rainfall > SEVERE_RAINFALL_MM * 1.5;
          const payload: AlertPayload = {
            user_id: farm.user_id,
            type: AlertType.WEATHER,
            title: 'Heavy rainfall alert',
            message: `Heavy rain (${day.rainfall}mm) expected on ${day.date}. Ensure drainage channels are clear and avoid fertilizer application.`,
            priority: AlertPriority.HIGH,
            data: {
              farm_id: farm.id,
              date: day.date,
              rainfall: day.rainfall,
              emergency: isEmergency,
            },
          };

          const alert = isEmergency
            ? await this.triggerEmergencyAlert(payload)
            : await this.enqueueOrTrigger(payload);
          if (alert) triggered.push(alert);
        }

        // Heat wave alert
        if (day.temperature > SEVERE_TEMPERATURE_C) {
          const suppressed = await this.isDismissedRecently(
            farm.user_id,
            AlertType.WEATHER,
            `temperature_${day.date}`,
          );
          if (suppressed) continue;

          const isEmergency = day.temperature > SEVERE_TEMPERATURE_C + 5;
          const payload: AlertPayload = {
            user_id: farm.user_id,
            type: AlertType.WEATHER,
            title: 'Heat wave alert',
            message: `High temperature (${day.temperature}°C) expected on ${day.date}. Increase irrigation frequency and consider shade netting for sensitive crops.`,
            priority: AlertPriority.HIGH,
            data: {
              farm_id: farm.id,
              date: day.date,
              temperature: day.temperature,
              emergency: isEmergency,
            },
          };

          const alert = isEmergency
            ? await this.triggerEmergencyAlert(payload)
            : await this.enqueueOrTrigger(payload);
          if (alert) triggered.push(alert);
        }
      }
    }

    return triggered;
  }

  // ── Batching Logic ──────────────────────────────────────────

  async enqueueOrTrigger(payload: AlertPayload): Promise<Alert | null> {
    const userId = payload.user_id;
    const lastFlush = this.lastBatchFlush.get(userId);
    const now = new Date();

    // If no recent batch or batch window expired, trigger immediately
    if (
      !lastFlush ||
      now.getTime() - lastFlush.getTime() >= BATCH_WINDOW_HOURS * 60 * 60 * 1000
    ) {
      this.lastBatchFlush.set(userId, now);
      this.batchQueue.delete(userId);
      return this.createAlertRecord(payload);
    }

    // Otherwise, add to batch queue
    const queue = this.batchQueue.get(userId) || [];
    queue.push({ payload, created_at: now });
    this.batchQueue.set(userId, queue);
    return null;
  }

  async flushBatchedAlerts(userId: string): Promise<Alert | null> {
    const queue = this.batchQueue.get(userId);
    if (!queue || queue.length === 0) return null;

    // Create a summary alert
    const types = [...new Set(queue.map((q) => q.payload.title))];
    const highestPriority = queue.some(
      (q) => q.payload.priority === AlertPriority.HIGH,
    )
      ? AlertPriority.HIGH
      : AlertPriority.MEDIUM;

    const summaryPayload: AlertPayload = {
      user_id: userId,
      type: queue[0].payload.type,
      title: `Alert summary (${queue.length} alerts)`,
      message: `You have ${queue.length} alerts: ${types.join(', ')}. Check your alerts for details.`,
      priority: highestPriority,
      data: {
        batched: true,
        alert_count: queue.length,
        alert_types: types,
      },
    };

    this.batchQueue.delete(userId);
    this.lastBatchFlush.set(userId, new Date());
    return this.createAlertRecord(summaryPayload);
  }

  // ── Emergency Alerts ────────────────────────────────────────

  async triggerEmergencyAlert(payload: AlertPayload): Promise<Alert> {
    // Emergency alerts bypass batching and are sent immediately
    payload.data = { ...payload.data, emergency: true, sent_within_30min: true };
    return this.createAlertRecord(payload);
  }

  // ── Database Operations ─────────────────────────────────────

  async createAlertRecord(payload: AlertPayload): Promise<Alert> {
    const pool = getPool();
    const id = crypto.randomUUID();
    const now = new Date();

    const result = await pool.query(
      `INSERT INTO alerts (id, user_id, type, title, message, priority, status, data, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        id,
        payload.user_id,
        payload.type,
        payload.title,
        payload.message,
        payload.priority,
        AlertStatus.UNREAD,
        JSON.stringify(payload.data || {}),
        now,
      ],
    );

    return this.mapRowToAlert(result.rows[0]);
  }

  async isDismissedRecently(
    userId: string,
    type: AlertType,
    context: string,
  ): Promise<boolean> {
    const pool = getPool();
    const cutoff = new Date(
      Date.now() - DISMISS_SUPPRESSION_HOURS * 60 * 60 * 1000,
    );

    const result = await pool.query(
      `SELECT COUNT(*) as count FROM alerts
       WHERE user_id = $1 AND type = $2 AND status = $3
         AND acknowledged_at > $4
         AND (data->>'crop' = $5 OR data->>'date' = $5)`,
      [userId, type, AlertStatus.ACKNOWLEDGED, cutoff, context],
    );

    return parseInt(result.rows[0].count, 10) > 0;
  }

  // ── Data Fetching ───────────────────────────────────────────

  async getActivePriceAlerts(): Promise<PriceAlertConfig[]> {
    const pool = getPool();
    const result = await pool.query(
      `SELECT id, user_id, crop, market, condition, threshold
       FROM price_alert_configs
       WHERE active = true`,
    );
    return result.rows;
  }

  async getCurrentPrices(): Promise<
    { crop: string; market_name: string; price: number; date: Date }[]
  > {
    const pool = getPool();
    const result = await pool.query(
      `SELECT DISTINCT ON (crop, market_name) crop, market_name, price, date
       FROM market_prices
       ORDER BY crop, market_name, date DESC`,
    );
    return result.rows;
  }

  async detectSignificantPriceChanges(): Promise<
    {
      user_id: string;
      crop: string;
      market: string;
      current_price: number;
      previous_price: number;
      change_percent: number;
    }[]
  > {
    const pool = getPool();
    const result = await pool.query(
      `WITH current_prices AS (
         SELECT DISTINCT ON (crop, market_name) crop, market_name, price, date
         FROM market_prices
         ORDER BY crop, market_name, date DESC
       ),
       past_prices AS (
         SELECT DISTINCT ON (crop, market_name) crop, market_name, price, date
         FROM market_prices
         WHERE date <= NOW() - INTERVAL '${PRICE_LOOKBACK_DAYS} days'
         ORDER BY crop, market_name, date DESC
       ),
       changes AS (
         SELECT
           c.crop, c.market_name,
           c.price AS current_price,
           p.price AS previous_price,
           ((c.price - p.price) / NULLIF(p.price, 0)) * 100 AS change_percent
         FROM current_prices c
         JOIN past_prices p ON c.crop = p.crop AND c.market_name = p.market_name
         WHERE ABS((c.price - p.price) / NULLIF(p.price, 0)) * 100 > ${PRICE_CHANGE_THRESHOLD_PERCENT}
       )
       SELECT ch.*, f.user_id
       FROM changes ch
       CROSS JOIN (
         SELECT DISTINCT user_id FROM farms
         JOIN crops ON crops.farm_id = farms.id
         WHERE crops.crop_type = ch.crop
       ) f`,
    );
    return result.rows.map((row: Record<string, unknown>) => ({
      user_id: row.user_id as string,
      crop: row.crop as string,
      market: row.market_name as string,
      current_price: Number(row.current_price),
      previous_price: Number(row.previous_price),
      change_percent: Number(row.change_percent),
    }));
  }

  // ── Helpers ─────────────────────────────────────────────────

  shouldTriggerCustom(config: PriceAlertConfig, currentPrice: number): boolean {
    if (config.condition === 'above' && currentPrice > config.threshold) {
      return true;
    }
    if (config.condition === 'below' && currentPrice < config.threshold) {
      return true;
    }
    return false;
  }

  getPriceActionAdvice(config: PriceAlertConfig, price: number): string {
    if (config.condition === 'above') {
      return 'Consider selling soon to lock in the higher price.';
    }
    return 'Prices have dropped. You may want to hold if possible.';
  }

  private mapRowToAlert(row: Record<string, unknown>): Alert {
    return {
      id: row.id as string,
      user_id: row.user_id as string,
      type: row.type as AlertType,
      title: row.title as string,
      message: row.message as string,
      priority: row.priority as AlertPriority,
      status: row.status as AlertStatus,
      created_at: new Date(row.created_at as string),
      read_at: row.read_at ? new Date(row.read_at as string) : undefined,
      acknowledged_at: row.acknowledged_at
        ? new Date(row.acknowledged_at as string)
        : undefined,
      data: row.data
        ? typeof row.data === 'string'
          ? JSON.parse(row.data as string)
          : (row.data as Record<string, unknown>)
        : undefined,
    };
  }
}

// ── Exported Constants (for testing) ────────────────────────────

export {
  PRICE_CHANGE_THRESHOLD_PERCENT,
  SEVERE_RAINFALL_MM,
  SEVERE_TEMPERATURE_C,
  WEATHER_FORECAST_HOURS,
  EMERGENCY_ALERT_WINDOW_MINUTES,
  BATCH_WINDOW_HOURS,
  DISMISS_SUPPRESSION_HOURS,
  PRICE_LOOKBACK_DAYS,
};
