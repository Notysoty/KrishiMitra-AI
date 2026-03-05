import { DBQueryMonitor, SLOW_QUERY_THRESHOLD_MS } from './DBQueryMonitor';
import { Logger } from './Logger';

describe('DBQueryMonitor', () => {
  let output: string[];
  let logger: Logger;

  beforeEach(() => {
    output = [];
    logger = new Logger({
      service: 'db-test',
      minLevel: 'debug' as any,
      writer: (json) => output.push(json),
    });
  });

  function createMonitor(overrides: Partial<ConstructorParameters<typeof DBQueryMonitor>[0]> = {}) {
    return new DBQueryMonitor({ logger, ...overrides });
  }

  // ── Recording queries ─────────────────────────────────────

  describe('recordQuery', () => {
    it('should record a normal query', () => {
      const monitor = createMonitor();
      const log = monitor.recordQuery({
        query: 'SELECT * FROM users',
        durationMs: 50,
        rowCount: 10,
        service: 'auth',
      });

      expect(log.query).toBe('SELECT * FROM users');
      expect(log.durationMs).toBe(50);
      expect(log.slow).toBe(false);
      expect(log.timestamp).toBeDefined();
      expect(monitor.getQueryLogs()).toHaveLength(1);
    });

    it('should flag slow queries exceeding threshold', () => {
      const monitor = createMonitor();
      const log = monitor.recordQuery({
        query: 'SELECT * FROM big_table',
        durationMs: 2500,
        service: 'market',
      });

      expect(log.slow).toBe(true);
    });

    it('should not flag queries at exactly the threshold', () => {
      const monitor = createMonitor();
      const log = monitor.recordQuery({
        query: 'SELECT 1',
        durationMs: SLOW_QUERY_THRESHOLD_MS,
        service: 'test',
      });

      expect(log.slow).toBe(false);
    });

    it('should use custom slow threshold', () => {
      const monitor = createMonitor({ slowThresholdMs: 500 });
      const log = monitor.recordQuery({
        query: 'SELECT 1',
        durationMs: 600,
        service: 'test',
      });

      expect(log.slow).toBe(true);
      expect(monitor.getSlowThresholdMs()).toBe(500);
    });

    it('should log a warning for slow queries', () => {
      const monitor = createMonitor();
      monitor.recordQuery({
        query: 'SELECT * FROM slow_table',
        durationMs: 3000,
        service: 'test',
      });

      const warnEntry = output.find((o) => JSON.parse(o).level === 'warn');
      expect(warnEntry).toBeDefined();
      expect(JSON.parse(warnEntry!).message).toBe('Slow database query detected');
    });

    it('should call onSlowQuery callback for slow queries', () => {
      const callback = jest.fn();
      const monitor = createMonitor({ onSlowQuery: callback });

      monitor.recordQuery({
        query: 'SELECT * FROM slow',
        durationMs: 3000,
        service: 'test',
      });

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback.mock.calls[0][0].slow).toBe(true);
    });

    it('should not call onSlowQuery for fast queries', () => {
      const callback = jest.fn();
      const monitor = createMonitor({ onSlowQuery: callback });

      monitor.recordQuery({
        query: 'SELECT 1',
        durationMs: 5,
        service: 'test',
      });

      expect(callback).not.toHaveBeenCalled();
    });

    it('should include tenantId when provided', () => {
      const monitor = createMonitor();
      const log = monitor.recordQuery({
        query: 'SELECT 1',
        durationMs: 10,
        service: 'test',
        tenantId: 't-1',
      });

      expect(log.tenantId).toBe('t-1');
    });
  });

  // ── Slow query retrieval ──────────────────────────────────

  describe('getSlowQueries', () => {
    it('should return only slow queries', () => {
      const monitor = createMonitor();
      monitor.recordQuery({ query: 'fast', durationMs: 10, service: 'test' });
      monitor.recordQuery({ query: 'slow', durationMs: 3000, service: 'test' });
      monitor.recordQuery({ query: 'fast2', durationMs: 20, service: 'test' });

      const slow = monitor.getSlowQueries();
      expect(slow).toHaveLength(1);
      expect(slow[0].query).toBe('slow');
    });

    it('should filter by date when provided', () => {
      const monitor = createMonitor();
      monitor.recordQuery({ query: 'slow', durationMs: 3000, service: 'test' });

      const futureDate = new Date(Date.now() + 100_000);
      const slow = monitor.getSlowQueries(futureDate);
      expect(slow).toHaveLength(0);
    });
  });

  // ── Query stats ───────────────────────────────────────────

  describe('getQueryStats', () => {
    it('should return zero stats when no queries', () => {
      const monitor = createMonitor();
      const stats = monitor.getQueryStats();

      expect(stats.totalQueries).toBe(0);
      expect(stats.slowQueries).toBe(0);
      expect(stats.avgDurationMs).toBe(0);
      expect(stats.maxDurationMs).toBe(0);
      expect(stats.p95DurationMs).toBe(0);
    });

    it('should calculate correct stats', () => {
      const monitor = createMonitor();
      monitor.recordQuery({ query: 'q1', durationMs: 100, service: 'test' });
      monitor.recordQuery({ query: 'q2', durationMs: 200, service: 'test' });
      monitor.recordQuery({ query: 'q3', durationMs: 3000, service: 'test' });

      const stats = monitor.getQueryStats();
      expect(stats.totalQueries).toBe(3);
      expect(stats.slowQueries).toBe(1);
      expect(stats.avgDurationMs).toBeCloseTo(1100, 0);
      expect(stats.maxDurationMs).toBe(3000);
    });
  });

  // ── Prune ─────────────────────────────────────────────────

  describe('prune', () => {
    it('should remove logs older than the specified window', async () => {
      const monitor = createMonitor();
      monitor.recordQuery({ query: 'q1', durationMs: 10, service: 'test' });

      // Wait a tiny bit so the log timestamp is in the past
      await new Promise((r) => setTimeout(r, 15));

      // Prune anything older than 5ms – the 15ms-old log should be removed
      const pruned = monitor.prune(5);
      expect(pruned).toBe(1);
      expect(monitor.getQueryLogs()).toHaveLength(0);
    });

    it('should keep recent logs', () => {
      const monitor = createMonitor();
      monitor.recordQuery({ query: 'q1', durationMs: 10, service: 'test' });

      const pruned = monitor.prune(60_000);
      expect(pruned).toBe(0);
      expect(monitor.getQueryLogs()).toHaveLength(1);
    });
  });

  // ── Constants ─────────────────────────────────────────────

  it('should export default slow query threshold of 2000ms', () => {
    expect(SLOW_QUERY_THRESHOLD_MS).toBe(2000);
  });
});
