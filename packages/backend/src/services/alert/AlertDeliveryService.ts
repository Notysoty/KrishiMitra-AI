import { getPool } from '../../db/pool';
import { AlertType, AlertPriority, AlertStatus } from '../../types/enums';
import { Alert, AlertPreferences } from '../../types/alert';

// ── Interfaces ──────────────────────────────────────────────────

export type DeliveryChannel = 'in_app' | 'sms' | 'email';

export type DeliveryStatus = 'pending' | 'sent' | 'failed';

export interface DeliveryRecord {
  alert_id: string;
  channel: DeliveryChannel;
  status: DeliveryStatus;
  sent_at?: Date;
  error?: string;
}

export interface PriceAlertConfigInput {
  crop: string;
  market: string;
  condition: 'above' | 'below';
  threshold: number;
}

export interface PriceAlertConfigRow {
  id: string;
  user_id: string;
  crop: string;
  market: string;
  condition: 'above' | 'below';
  threshold: number;
  active: boolean;
  created_at: Date;
}

// ── Default Preferences ─────────────────────────────────────────

const DEFAULT_PREFERENCES: Omit<AlertPreferences, 'user_id'> = {
  in_app: true,
  sms: false,
  email: false,
  price_alerts: true,
  weather_alerts: true,
  pest_alerts: true,
};

// ── AlertDeliveryService ────────────────────────────────────────

export class AlertDeliveryService {

  // ── Alert Delivery ──────────────────────────────────────────

  /**
   * Deliver an alert through all channels enabled in user preferences.
   * Tracks delivery status per channel.
   */
  async deliverAlert(alert: Alert): Promise<DeliveryRecord[]> {
    const preferences = await this.getPreferences(alert.user_id);
    const records: DeliveryRecord[] = [];

    // Check if this alert type is enabled
    if (!this.isAlertTypeEnabled(alert.type, preferences)) {
      return records;
    }

    if (preferences.in_app) {
      const record = await this.deliverInApp(alert);
      records.push(record);
    }

    if (preferences.sms) {
      const record = await this.deliverSMS(alert);
      records.push(record);
    }

    if (preferences.email) {
      const record = await this.deliverEmail(alert);
      records.push(record);
    }

    return records;
  }

  private isAlertTypeEnabled(type: AlertType, prefs: AlertPreferences): boolean {
    switch (type) {
      case AlertType.PRICE_CHANGE:
        return prefs.price_alerts;
      case AlertType.WEATHER:
        return prefs.weather_alerts;
      case AlertType.PEST:
        return prefs.pest_alerts;
      default:
        return true;
    }
  }

  async deliverInApp(alert: Alert): Promise<DeliveryRecord> {
    // In-app delivery is simply marking the alert as stored (already in DB)
    return {
      alert_id: alert.id,
      channel: 'in_app',
      status: 'sent',
      sent_at: new Date(),
    };
  }

  async deliverSMS(alert: Alert): Promise<DeliveryRecord> {
    // MVP: Mock SMS delivery — in production, integrate with SMS gateway
    try {
      // Simulate SMS send (would call SMS gateway API in production)
      console.log(`[SMS] Sending to user ${alert.user_id}: ${alert.title}`);
      return {
        alert_id: alert.id,
        channel: 'sms',
        status: 'sent',
        sent_at: new Date(),
      };
    } catch (err) {
      return {
        alert_id: alert.id,
        channel: 'sms',
        status: 'failed',
        error: err instanceof Error ? err.message : 'SMS delivery failed',
      };
    }
  }

  async deliverEmail(alert: Alert): Promise<DeliveryRecord> {
    // MVP: Mock email delivery — in production, integrate with email service
    try {
      console.log(`[Email] Sending to user ${alert.user_id}: ${alert.title}`);
      return {
        alert_id: alert.id,
        channel: 'email',
        status: 'sent',
        sent_at: new Date(),
      };
    } catch (err) {
      return {
        alert_id: alert.id,
        channel: 'email',
        status: 'failed',
        error: err instanceof Error ? err.message : 'Email delivery failed',
      };
    }
  }

  // ── Alert Preferences ───────────────────────────────────────

  async getPreferences(userId: string): Promise<AlertPreferences> {
    const pool = getPool();
    const result = await pool.query(
      `SELECT user_id, in_app, sms, email, price_alerts, weather_alerts, pest_alerts
       FROM alert_preferences WHERE user_id = $1`,
      [userId],
    );

    if (result.rows.length === 0) {
      return { user_id: userId, ...DEFAULT_PREFERENCES };
    }

    return this.mapRowToPreferences(result.rows[0]);
  }

  async updatePreferences(
    userId: string,
    updates: Partial<Omit<AlertPreferences, 'user_id'>>,
  ): Promise<AlertPreferences> {
    const pool = getPool();
    const current = await this.getPreferences(userId);

    const merged: AlertPreferences = {
      user_id: userId,
      in_app: updates.in_app ?? current.in_app,
      sms: updates.sms ?? current.sms,
      email: updates.email ?? current.email,
      price_alerts: updates.price_alerts ?? current.price_alerts,
      weather_alerts: updates.weather_alerts ?? current.weather_alerts,
      pest_alerts: updates.pest_alerts ?? current.pest_alerts,
    };

    const result = await pool.query(
      `INSERT INTO alert_preferences (user_id, in_app, sms, email, price_alerts, weather_alerts, pest_alerts)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id) DO UPDATE SET
         in_app = EXCLUDED.in_app,
         sms = EXCLUDED.sms,
         email = EXCLUDED.email,
         price_alerts = EXCLUDED.price_alerts,
         weather_alerts = EXCLUDED.weather_alerts,
         pest_alerts = EXCLUDED.pest_alerts
       RETURNING *`,
      [merged.user_id, merged.in_app, merged.sms, merged.email, merged.price_alerts, merged.weather_alerts, merged.pest_alerts],
    );

    return this.mapRowToPreferences(result.rows[0]);
  }

  // ── Alert Queries ───────────────────────────────────────────

  async getAlerts(
    userId: string,
    options: { status?: AlertStatus; type?: AlertType; limit?: number; offset?: number } = {},
  ): Promise<{ alerts: Alert[]; total: number }> {
    const pool = getPool();
    const conditions: string[] = ['user_id = $1'];
    const params: unknown[] = [userId];
    let paramIdx = 2;

    if (options.status) {
      conditions.push(`status = $${paramIdx++}`);
      params.push(options.status);
    }
    if (options.type) {
      conditions.push(`type = $${paramIdx++}`);
      params.push(options.type);
    }

    const where = conditions.join(' AND ');
    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;

    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM alerts WHERE ${where}`,
      params,
    );

    const result = await pool.query(
      `SELECT * FROM alerts WHERE ${where} ORDER BY created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
      [...params, limit, offset],
    );

    return {
      alerts: result.rows.map(this.mapRowToAlert),
      total: parseInt(countResult.rows[0].total, 10),
    };
  }

  async acknowledgeAlert(alertId: string, userId: string): Promise<Alert | null> {
    const pool = getPool();
    const now = new Date();

    const result = await pool.query(
      `UPDATE alerts SET status = $1, acknowledged_at = $2
       WHERE id = $3 AND user_id = $4
       RETURNING *`,
      [AlertStatus.ACKNOWLEDGED, now, alertId, userId],
    );

    if (result.rows.length === 0) return null;
    return this.mapRowToAlert(result.rows[0]);
  }

  async getAlertHistory(
    userId: string,
    options: { days?: number; limit?: number; offset?: number } = {},
  ): Promise<{ alerts: Alert[]; total: number }> {
    const pool = getPool();
    const days = options.days ?? 30;
    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM alerts WHERE user_id = $1 AND created_at >= $2`,
      [userId, cutoff],
    );

    const result = await pool.query(
      `SELECT * FROM alerts WHERE user_id = $1 AND created_at >= $2
       ORDER BY created_at DESC LIMIT $3 OFFSET $4`,
      [userId, cutoff, limit, offset],
    );

    return {
      alerts: result.rows.map(this.mapRowToAlert),
      total: parseInt(countResult.rows[0].total, 10),
    };
  }

  // ── Price Alert CRUD ────────────────────────────────────────

  async createPriceAlert(
    userId: string,
    input: PriceAlertConfigInput,
  ): Promise<PriceAlertConfigRow> {
    const pool = getPool();
    const id = crypto.randomUUID();

    const result = await pool.query(
      `INSERT INTO price_alert_configs (id, user_id, crop, market, condition, threshold, active, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, true, NOW())
       RETURNING *`,
      [id, userId, input.crop, input.market, input.condition, input.threshold],
    );

    return this.mapRowToPriceAlertConfig(result.rows[0]);
  }

  async getPriceAlerts(userId: string): Promise<PriceAlertConfigRow[]> {
    const pool = getPool();
    const result = await pool.query(
      `SELECT * FROM price_alert_configs WHERE user_id = $1 AND active = true ORDER BY created_at DESC`,
      [userId],
    );
    return result.rows.map(this.mapRowToPriceAlertConfig);
  }

  // ── Mappers ─────────────────────────────────────────────────

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
      acknowledged_at: row.acknowledged_at ? new Date(row.acknowledged_at as string) : undefined,
      data: row.data
        ? typeof row.data === 'string'
          ? JSON.parse(row.data as string)
          : (row.data as Record<string, unknown>)
        : undefined,
    };
  }

  private mapRowToPreferences(row: Record<string, unknown>): AlertPreferences {
    return {
      user_id: row.user_id as string,
      in_app: row.in_app as boolean,
      sms: row.sms as boolean,
      email: row.email as boolean,
      price_alerts: row.price_alerts as boolean,
      weather_alerts: row.weather_alerts as boolean,
      pest_alerts: row.pest_alerts as boolean,
    };
  }

  private mapRowToPriceAlertConfig(row: Record<string, unknown>): PriceAlertConfigRow {
    return {
      id: row.id as string,
      user_id: row.user_id as string,
      crop: row.crop as string,
      market: row.market as string,
      condition: row.condition as 'above' | 'below',
      threshold: Number(row.threshold),
      active: row.active as boolean,
      created_at: new Date(row.created_at as string),
    };
  }
}

export { DEFAULT_PREFERENCES };
