import { MonitoringService, ERROR_RATE_ALARM, DEFAULT_NAMESPACE } from './MonitoringService';

describe('MonitoringService', () => {
  // ── KPI Snapshot ──────────────────────────────────────────

  describe('getKPISnapshot', () => {
    it('should return zero values when no requests recorded', () => {
      const svc = new MonitoringService();
      const snap = svc.getKPISnapshot();

      expect(snap.requestCount).toBe(0);
      expect(snap.errorRate).toBe(0);
      expect(snap.availability).toBe(100);
      expect(snap.responseTimeP50Ms).toBe(0);
    });

    it('should calculate correct KPIs for successful requests', () => {
      const svc = new MonitoringService();
      svc.recordRequest(100, true);
      svc.recordRequest(200, true);
      svc.recordRequest(300, true);

      const snap = svc.getKPISnapshot();
      expect(snap.requestCount).toBe(3);
      expect(snap.errorRate).toBe(0);
      expect(snap.availability).toBe(100);
      expect(snap.responseTimeP50Ms).toBe(200);
    });

    it('should calculate error rate correctly', () => {
      const svc = new MonitoringService();
      // 2 errors out of 10 = 20%
      for (let i = 0; i < 8; i++) svc.recordRequest(50, true);
      svc.recordRequest(50, false);
      svc.recordRequest(50, false);

      const snap = svc.getKPISnapshot();
      expect(snap.errorRate).toBe(20);
      expect(snap.availability).toBe(80);
      expect(snap.requestCount).toBe(10);
    });

    it('should calculate percentiles correctly', () => {
      const svc = new MonitoringService();
      // Record 100 requests with durations 1..100
      for (let i = 1; i <= 100; i++) svc.recordRequest(i, true);

      const snap = svc.getKPISnapshot();
      expect(snap.responseTimeP50Ms).toBe(50);
      expect(snap.responseTimeP95Ms).toBe(95);
      expect(snap.responseTimeP99Ms).toBe(99);
    });

    it('should only include requests within the window', () => {
      const svc = new MonitoringService({ windowMs: 100 });
      svc.recordRequest(50, true);

      // Snapshot should include the request (it was just recorded)
      const snap = svc.getKPISnapshot();
      expect(snap.requestCount).toBe(1);
    });
  });

  // ── Error rate breach detection ───────────────────────────

  describe('isErrorRateBreached', () => {
    it('should return false when no requests', () => {
      const svc = new MonitoringService();
      expect(svc.isErrorRateBreached()).toBe(false);
    });

    it('should return true when error rate exceeds threshold', () => {
      const svc = new MonitoringService();
      // 2 errors out of 10 = 20% > 1%
      for (let i = 0; i < 8; i++) svc.recordRequest(50, true);
      svc.recordRequest(50, false);
      svc.recordRequest(50, false);

      expect(svc.isErrorRateBreached(1)).toBe(true);
    });

    it('should return false when error rate is below threshold', () => {
      const svc = new MonitoringService();
      for (let i = 0; i < 100; i++) svc.recordRequest(50, true);

      expect(svc.isErrorRateBreached(1)).toBe(false);
    });

    it('should use default 1% threshold from ERROR_RATE_ALARM', () => {
      expect(ERROR_RATE_ALARM.threshold).toBe(1);
      expect(ERROR_RATE_ALARM.periodSeconds).toBe(300);
    });
  });

  // ── Publish KPIs ──────────────────────────────────────────

  describe('publishKPIs', () => {
    it('should return metric data points', async () => {
      const svc = new MonitoringService();
      svc.recordRequest(100, true);

      const metrics = await svc.publishKPIs();
      expect(metrics).toHaveLength(6);

      const names = metrics.map((m) => m.name);
      expect(names).toContain('ResponseTimeP50');
      expect(names).toContain('ResponseTimeP95');
      expect(names).toContain('ResponseTimeP99');
      expect(names).toContain('ErrorRate');
      expect(names).toContain('Availability');
      expect(names).toContain('RequestCount');
    });

    it('should call CloudWatch client when provided', async () => {
      const mockClient = {
        putMetricData: jest.fn().mockResolvedValue(undefined),
        createAlarm: jest.fn().mockResolvedValue(undefined),
        getAlarmState: jest.fn().mockResolvedValue(undefined),
      };
      const svc = new MonitoringService({ cloudWatchClient: mockClient });
      svc.recordRequest(100, true);

      await svc.publishKPIs();
      expect(mockClient.putMetricData).toHaveBeenCalledTimes(1);
      expect(mockClient.putMetricData.mock.calls[0][0]).toBe(DEFAULT_NAMESPACE);
    });
  });

  // ── Alarm management ──────────────────────────────────────

  describe('alarms', () => {
    it('should create error rate alarm with defaults', async () => {
      const svc = new MonitoringService();
      const alarm = await svc.createErrorRateAlarm();

      expect(alarm.name).toBe('HighErrorRate');
      expect(alarm.threshold).toBe(1);
      expect(alarm.periodSeconds).toBe(300);
      expect(svc.getAlarmsCreated()).toHaveLength(1);
    });

    it('should create error rate alarm with overrides', async () => {
      const svc = new MonitoringService();
      const alarm = await svc.createErrorRateAlarm({ threshold: 5 });

      expect(alarm.threshold).toBe(5);
      expect(alarm.name).toBe('HighErrorRate');
    });

    it('should create custom alarm', async () => {
      const svc = new MonitoringService();
      const config = {
        name: 'SlowDB',
        metricName: 'DBQueryDuration',
        threshold: 2000,
        comparisonOperator: 'GreaterThanThreshold' as const,
        evaluationPeriods: 1,
        periodSeconds: 60,
        statistic: 'Maximum' as const,
        actionsEnabled: true,
        alarmActions: [],
      };

      const alarm = await svc.createCustomAlarm(config);
      expect(alarm.name).toBe('SlowDB');
      expect(svc.getAlarmsCreated()).toHaveLength(1);
    });

    it('should call CloudWatch client for alarm creation', async () => {
      const mockClient = {
        putMetricData: jest.fn().mockResolvedValue(undefined),
        createAlarm: jest.fn().mockResolvedValue(undefined),
        getAlarmState: jest.fn().mockResolvedValue(undefined),
      };
      const svc = new MonitoringService({ cloudWatchClient: mockClient });

      await svc.createErrorRateAlarm();
      expect(mockClient.createAlarm).toHaveBeenCalledTimes(1);
    });

    it('should return undefined alarm state when no client', async () => {
      const svc = new MonitoringService();
      const state = await svc.getAlarmState('HighErrorRate');
      expect(state).toBeUndefined();
    });
  });

  // ── Housekeeping ──────────────────────────────────────────

  describe('prune', () => {
    it('should remove old records', () => {
      const svc = new MonitoringService({ windowMs: 100 });
      svc.recordRequest(50, true);

      // All records are recent, prune should remove 0
      const pruned = svc.prune();
      expect(pruned).toBe(0);
      expect(svc.getRecordCount()).toBe(1);
    });
  });

  it('should return the namespace', () => {
    const svc = new MonitoringService({ namespace: 'Custom' });
    expect(svc.getNamespace()).toBe('Custom');
  });
});
