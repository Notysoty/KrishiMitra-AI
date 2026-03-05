import request from 'supertest';
import express from 'express';
import { AlertType, AlertPriority, AlertStatus } from '../types/enums';

// ── Mock dependencies ──────────────────────────────────────────

const mockGetAlerts = jest.fn();
const mockUpdatePreferences = jest.fn();
const mockAcknowledgeAlert = jest.fn();
const mockGetAlertHistory = jest.fn();

jest.mock('../services/alert/AlertDeliveryService', () => ({
  AlertDeliveryService: jest.fn().mockImplementation(() => ({
    getAlerts: mockGetAlerts,
    updatePreferences: mockUpdatePreferences,
    acknowledgeAlert: mockAcknowledgeAlert,
    getAlertHistory: mockGetAlertHistory,
  })),
}));

jest.mock('../middleware/authenticate', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { id: 'user-1', tenant_id: 'tenant-1', roles: ['farmer'], sessionId: 's1' };
    next();
  },
  AuthenticatedRequest: {},
}));

jest.mock('../middleware/rbac', () => ({
  requirePermissions: () => (_req: any, _res: any, next: any) => next(),
  Permission: {
    ALERTS_VIEW: 'alerts:view',
    ALERTS_MANAGE_PREFS: 'alerts:manage_prefs',
  },
}));

import alertRoutes from './alerts';

const app = express();
app.use(express.json());
app.use('/api/v1/alerts', alertRoutes);

describe('GET /api/v1/alerts', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return alerts for the user', async () => {
    const now = new Date().toISOString();
    mockGetAlerts.mockResolvedValue({
      alerts: [
        {
          id: 'a1', user_id: 'user-1', type: AlertType.PRICE_CHANGE,
          title: 'Price alert', message: 'Wheat up', priority: AlertPriority.MEDIUM,
          status: AlertStatus.UNREAD, created_at: now,
        },
      ],
      total: 1,
    });

    const res = await request(app).get('/api/v1/alerts');
    expect(res.status).toBe(200);
    expect(res.body.alerts).toHaveLength(1);
    expect(res.body.total).toBe(1);
  });

  it('should pass filter params to service', async () => {
    mockGetAlerts.mockResolvedValue({ alerts: [], total: 0 });

    await request(app).get('/api/v1/alerts?status=unread&type=weather&limit=10&offset=5');
    expect(mockGetAlerts).toHaveBeenCalledWith('user-1', {
      status: 'unread',
      type: 'weather',
      limit: 10,
      offset: 5,
    });
  });

  it('should reject invalid status', async () => {
    const res = await request(app).get('/api/v1/alerts?status=invalid');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('status');
  });

  it('should reject invalid type', async () => {
    const res = await request(app).get('/api/v1/alerts?type=invalid');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('type');
  });

  it('should return 500 on error', async () => {
    mockGetAlerts.mockRejectedValue(new Error('boom'));
    const res = await request(app).get('/api/v1/alerts');
    expect(res.status).toBe(500);
  });
});

describe('POST /api/v1/alerts/preferences', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should update preferences', async () => {
    mockUpdatePreferences.mockResolvedValue({
      user_id: 'user-1',
      in_app: true,
      sms: true,
      email: false,
      price_alerts: true,
      weather_alerts: true,
      pest_alerts: true,
    });

    const res = await request(app)
      .post('/api/v1/alerts/preferences')
      .send({ sms: true });

    expect(res.status).toBe(200);
    expect(res.body.sms).toBe(true);
    expect(mockUpdatePreferences).toHaveBeenCalledWith('user-1', { sms: true });
  });

  it('should only pass boolean fields', async () => {
    mockUpdatePreferences.mockResolvedValue({
      user_id: 'user-1', in_app: true, sms: false, email: false,
      price_alerts: true, weather_alerts: true, pest_alerts: true,
    });

    await request(app)
      .post('/api/v1/alerts/preferences')
      .send({ sms: 'yes', in_app: true, extra_field: true });

    // 'sms: "yes"' is not boolean, so it should not be passed
    expect(mockUpdatePreferences).toHaveBeenCalledWith('user-1', { in_app: true });
  });

  it('should return 500 on error', async () => {
    mockUpdatePreferences.mockRejectedValue(new Error('boom'));
    const res = await request(app)
      .post('/api/v1/alerts/preferences')
      .send({ sms: true });
    expect(res.status).toBe(500);
  });
});

describe('PUT /api/v1/alerts/:id/acknowledge', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should acknowledge an alert', async () => {
    const now = new Date().toISOString();
    mockAcknowledgeAlert.mockResolvedValue({
      id: 'alert-1', user_id: 'user-1', type: AlertType.PRICE_CHANGE,
      title: 'Alert', message: 'msg', priority: AlertPriority.MEDIUM,
      status: AlertStatus.ACKNOWLEDGED, created_at: now,
      acknowledged_at: now,
    });

    const res = await request(app).put('/api/v1/alerts/alert-1/acknowledge');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe(AlertStatus.ACKNOWLEDGED);
  });

  it('should return 404 when alert not found', async () => {
    mockAcknowledgeAlert.mockResolvedValue(null);

    const res = await request(app).put('/api/v1/alerts/nonexistent/acknowledge');
    expect(res.status).toBe(404);
    expect(res.body.error).toContain('not found');
  });

  it('should return 500 on error', async () => {
    mockAcknowledgeAlert.mockRejectedValue(new Error('boom'));
    const res = await request(app).put('/api/v1/alerts/alert-1/acknowledge');
    expect(res.status).toBe(500);
  });
});

describe('GET /api/v1/alerts/history', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return alert history', async () => {
    mockGetAlertHistory.mockResolvedValue({
      alerts: [
        {
          id: 'a1', user_id: 'user-1', type: AlertType.WEATHER,
          title: 'Weather', message: 'msg', priority: AlertPriority.HIGH,
          status: AlertStatus.ACKNOWLEDGED, created_at: new Date().toISOString(),
        },
      ],
      total: 1,
    });

    const res = await request(app).get('/api/v1/alerts/history');
    expect(res.status).toBe(200);
    expect(res.body.alerts).toHaveLength(1);
    expect(res.body.total).toBe(1);
  });

  it('should pass days parameter', async () => {
    mockGetAlertHistory.mockResolvedValue({ alerts: [], total: 0 });

    await request(app).get('/api/v1/alerts/history?days=7');
    expect(mockGetAlertHistory).toHaveBeenCalledWith('user-1', {
      days: 7,
      limit: undefined,
      offset: undefined,
    });
  });

  it('should reject invalid days parameter', async () => {
    const res = await request(app).get('/api/v1/alerts/history?days=0');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('days');
  });

  it('should reject days > 365', async () => {
    const res = await request(app).get('/api/v1/alerts/history?days=400');
    expect(res.status).toBe(400);
  });

  it('should return 500 on error', async () => {
    mockGetAlertHistory.mockRejectedValue(new Error('boom'));
    const res = await request(app).get('/api/v1/alerts/history');
    expect(res.status).toBe(500);
  });
});
