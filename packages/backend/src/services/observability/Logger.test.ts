import { Logger, DEFAULT_RETENTION } from './Logger';
import { LogLevel } from '../../types/observability';

describe('Logger', () => {
  let output: string[];
  const writer = (json: string) => {
    output.push(json);
  };

  beforeEach(() => {
    output = [];
  });

  function createLogger(overrides: Partial<Parameters<typeof Logger['prototype']['getService']> extends never ? Record<string, unknown> : Record<string, unknown>> = {}) {
    return new Logger({ service: 'test-service', writer, ...overrides });
  }

  // ── Structured JSON output ────────────────────────────────

  describe('structured JSON output', () => {
    it('should output valid JSON with required fields', () => {
      const logger = createLogger();
      logger.info('hello world');

      expect(output).toHaveLength(1);
      const entry = JSON.parse(output[0]);
      expect(entry.timestamp).toBeDefined();
      expect(entry.level).toBe('info');
      expect(entry.message).toBe('hello world');
      expect(entry.service).toBe('test-service');
    });

    it('should include metadata in log entry', () => {
      const logger = createLogger();
      logger.info('with meta', { tenantId: 't-1', userId: 'u-1', requestId: 'r-1' });

      const entry = JSON.parse(output[0]);
      expect(entry.tenantId).toBe('t-1');
      expect(entry.userId).toBe('u-1');
      expect(entry.requestId).toBe('r-1');
    });

    it('should include trace context in log entry', () => {
      const logger = createLogger();
      logger.info('traced', { traceId: 'trace-1', spanId: 'span-1', parentSpanId: 'parent-1' });

      const entry = JSON.parse(output[0]);
      expect(entry.traceId).toBe('trace-1');
      expect(entry.spanId).toBe('span-1');
      expect(entry.parentSpanId).toBe('parent-1');
    });

    it('should include error details for error level', () => {
      const logger = createLogger();
      const err = new Error('something broke');
      logger.error('failure', err);

      const entry = JSON.parse(output[0]);
      expect(entry.level).toBe('error');
      expect(entry.error.name).toBe('Error');
      expect(entry.error.message).toBe('something broke');
      expect(entry.error.stack).toBeDefined();
    });

    it('should include error details for fatal level', () => {
      const logger = createLogger();
      const err = new TypeError('type issue');
      logger.fatal('crash', err);

      const entry = JSON.parse(output[0]);
      expect(entry.level).toBe('fatal');
      expect(entry.error.name).toBe('TypeError');
    });
  });

  // ── Log levels ────────────────────────────────────────────

  describe('log levels', () => {
    it('should respect minimum log level', () => {
      const logger = createLogger({ minLevel: LogLevel.WARN });
      logger.debug('skip');
      logger.info('skip');
      logger.warn('keep');
      logger.error('keep', new Error('e'));

      expect(output).toHaveLength(2);
      expect(JSON.parse(output[0]).level).toBe('warn');
      expect(JSON.parse(output[1]).level).toBe('error');
    });

    it('should default to INFO level', () => {
      const logger = createLogger();
      expect(logger.getMinLevel()).toBe(LogLevel.INFO);
    });

    it('should log debug when minLevel is DEBUG', () => {
      const logger = createLogger({ minLevel: LogLevel.DEBUG });
      logger.debug('visible');
      expect(output).toHaveLength(1);
    });

    it('should return undefined when log is below min level', () => {
      const logger = createLogger({ minLevel: LogLevel.ERROR });
      const result = logger.log(LogLevel.INFO, 'skipped');
      expect(result).toBeUndefined();
      expect(output).toHaveLength(0);
    });
  });

  // ── CloudWatch buffering ──────────────────────────────────

  describe('CloudWatch buffering', () => {
    it('should buffer events when cloudWatchClient is provided', () => {
      const mockClient = {
        putLogEvents: jest.fn().mockResolvedValue(undefined),
        createLogGroup: jest.fn().mockResolvedValue(undefined),
      };
      const logger = new Logger({ service: 'test', writer, cloudWatchClient: mockClient });

      logger.info('buffered');
      expect(logger.getBufferSize()).toBe(1);
    });

    it('should not buffer when no cloudWatchClient', () => {
      const logger = createLogger();
      logger.info('not buffered');
      expect(logger.getBufferSize()).toBe(0);
    });

    it('should flush buffer to CloudWatch', async () => {
      const mockClient = {
        putLogEvents: jest.fn().mockResolvedValue(undefined),
        createLogGroup: jest.fn().mockResolvedValue(undefined),
      };
      const logger = new Logger({ service: 'test', writer, cloudWatchClient: mockClient });

      logger.info('event1');
      logger.info('event2');
      expect(logger.getBufferSize()).toBe(2);

      await logger.flush();
      expect(logger.getBufferSize()).toBe(0);
      expect(mockClient.putLogEvents).toHaveBeenCalledTimes(1);
      expect(mockClient.putLogEvents.mock.calls[0][2]).toHaveLength(2);
    });

    it('should not call putLogEvents when buffer is empty', async () => {
      const mockClient = {
        putLogEvents: jest.fn().mockResolvedValue(undefined),
        createLogGroup: jest.fn().mockResolvedValue(undefined),
      };
      const logger = new Logger({ service: 'test', writer, cloudWatchClient: mockClient });

      await logger.flush();
      expect(mockClient.putLogEvents).not.toHaveBeenCalled();
    });
  });

  // ── Retention config ──────────────────────────────────────

  describe('retention', () => {
    it('should default to 30 days retention', () => {
      const logger = createLogger();
      const config = logger.getRetentionConfig();
      expect(config.retentionDays).toBe(30);
      expect(config.archiveEnabled).toBe(true);
    });

    it('should use custom retention config', () => {
      const logger = createLogger({ retention: { retentionDays: 90, archiveEnabled: false } });
      const config = logger.getRetentionConfig();
      expect(config.retentionDays).toBe(90);
      expect(config.archiveEnabled).toBe(false);
    });

    it('should export DEFAULT_RETENTION with 30 days', () => {
      expect(DEFAULT_RETENTION.retentionDays).toBe(30);
    });
  });

  // ── Service name ──────────────────────────────────────────

  it('should return the service name', () => {
    const logger = createLogger();
    expect(logger.getService()).toBe('test-service');
  });
});
