/**
 * Structured JSON logger with CloudWatch Logs integration.
 * Outputs structured JSON to stdout (for container/CloudWatch agent pickup)
 * and optionally ships directly to CloudWatch Logs via the client abstraction.
 *
 * Requirements: 29.1, 29.5, 29.9
 */

import {
  LogLevel,
  StructuredLogEntry,
  CloudWatchLogsClient,
  LogRetentionConfig,
} from '../../types/observability';

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  [LogLevel.DEBUG]: 0,
  [LogLevel.INFO]: 1,
  [LogLevel.WARN]: 2,
  [LogLevel.ERROR]: 3,
  [LogLevel.FATAL]: 4,
};

export const DEFAULT_RETENTION: LogRetentionConfig = {
  retentionDays: 30,
  archiveEnabled: true,
  archiveDestination: 's3://krishimitra-logs-archive',
};

export interface LoggerOptions {
  service: string;
  minLevel?: LogLevel;
  cloudWatchClient?: CloudWatchLogsClient;
  logGroupName?: string;
  logStreamName?: string;
  retention?: LogRetentionConfig;
  /** Override for stdout writer – useful for testing */
  writer?: (json: string) => void;
}

export class Logger {
  private service: string;
  private minLevel: LogLevel;
  private cloudWatchClient?: CloudWatchLogsClient;
  private logGroupName: string;
  private logStreamName: string;
  private retention: LogRetentionConfig;
  private writer: (json: string) => void;
  private buffer: Array<{ timestamp: number; message: string }> = [];
  private flushIntervalMs = 5_000;
  private flushTimer?: ReturnType<typeof setInterval>;

  constructor(options: LoggerOptions) {
    this.service = options.service;
    this.minLevel = options.minLevel ?? LogLevel.INFO;
    this.cloudWatchClient = options.cloudWatchClient;
    this.logGroupName = options.logGroupName ?? `/krishimitra/${options.service}`;
    this.logStreamName = options.logStreamName ?? `${options.service}-${new Date().toISOString().slice(0, 10)}`;
    this.retention = options.retention ?? DEFAULT_RETENTION;
    this.writer = options.writer ?? ((json: string) => process.stdout.write(json + '\n'));
  }

  // ── Public API ────────────────────────────────────────────

  debug(message: string, meta?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, meta);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, meta);
  }

  error(message: string, error?: Error, meta?: Record<string, unknown>): void {
    this.log(LogLevel.ERROR, message, meta, error);
  }

  fatal(message: string, error?: Error, meta?: Record<string, unknown>): void {
    this.log(LogLevel.FATAL, message, meta, error);
  }

  // ── Core ──────────────────────────────────────────────────

  log(
    level: LogLevel,
    message: string,
    meta?: Record<string, unknown>,
    error?: Error,
  ): StructuredLogEntry | undefined {
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[this.minLevel]) {
      return undefined;
    }

    const entry: StructuredLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      service: this.service,
      traceId: meta?.traceId as string | undefined,
      spanId: meta?.spanId as string | undefined,
      parentSpanId: meta?.parentSpanId as string | undefined,
      tenantId: meta?.tenantId as string | undefined,
      userId: meta?.userId as string | undefined,
      requestId: meta?.requestId as string | undefined,
      metadata: meta,
    };

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    const json = JSON.stringify(entry);
    this.writer(json);
    this.bufferForCloudWatch(json);

    return entry;
  }

  // ── CloudWatch buffering ──────────────────────────────────

  private bufferForCloudWatch(json: string): void {
    if (!this.cloudWatchClient) return;
    this.buffer.push({ timestamp: Date.now(), message: json });
  }

  async flush(): Promise<void> {
    if (!this.cloudWatchClient || this.buffer.length === 0) return;
    const events = [...this.buffer];
    this.buffer = [];
    await this.cloudWatchClient.putLogEvents(this.logGroupName, this.logStreamName, events);
  }

  startAutoFlush(): void {
    this.flushTimer = setInterval(() => {
      this.flush().catch(() => {
        /* swallow flush errors to avoid crashing the process */
      });
    }, this.flushIntervalMs);
  }

  stopAutoFlush(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
  }

  // ── Accessors ─────────────────────────────────────────────

  getRetentionConfig(): LogRetentionConfig {
    return { ...this.retention };
  }

  getService(): string {
    return this.service;
  }

  getMinLevel(): LogLevel {
    return this.minLevel;
  }

  getBufferSize(): number {
    return this.buffer.length;
  }
}
