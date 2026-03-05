/**
 * Distributed tracing middleware compatible with AWS X-Ray.
 * Generates trace/span IDs, propagates context, and records spans.
 *
 * Requirements: 29.2
 */

import { randomUUID } from 'crypto';
import {
  TraceContext,
  Span,
  SpanOptions,
  XRayClient,
} from '../../types/observability';

export interface TracerOptions {
  service: string;
  xrayClient?: XRayClient;
  /** Sampling rate 0–1 (default 1.0 = sample everything) */
  samplingRate?: number;
}

export class Tracer {
  private service: string;
  private xrayClient?: XRayClient;
  private samplingRate: number;
  private activeSpans: Map<string, Span> = new Map();
  private completedSpans: Span[] = [];

  constructor(options: TracerOptions) {
    this.service = options.service;
    this.xrayClient = options.xrayClient;
    this.samplingRate = options.samplingRate ?? 1.0;
  }

  // ── Public API ────────────────────────────────────────────

  /**
   * Create a new root trace context.
   */
  createTraceContext(): TraceContext {
    return {
      traceId: this.generateTraceId(),
      spanId: this.generateSpanId(),
      sampled: Math.random() < this.samplingRate,
    };
  }

  /**
   * Parse an incoming X-Ray trace header (or return a new context).
   * Format: Root=<traceId>;Parent=<parentSpanId>;Sampled=<0|1>
   */
  parseTraceHeader(header?: string): TraceContext {
    if (!header) return this.createTraceContext();

    const parts: Record<string, string> = {};
    for (const segment of header.split(';')) {
      const [key, value] = segment.split('=');
      if (key && value) parts[key.trim()] = value.trim();
    }

    return {
      traceId: parts['Root'] || this.generateTraceId(),
      spanId: this.generateSpanId(),
      parentSpanId: parts['Parent'],
      sampled: parts['Sampled'] !== '0',
    };
  }

  /**
   * Format a trace context into an X-Ray compatible header string.
   */
  formatTraceHeader(ctx: TraceContext): string {
    return `Root=${ctx.traceId};Parent=${ctx.spanId};Sampled=${ctx.sampled ? '1' : '0'}`;
  }

  /**
   * Start a new span within a trace.
   */
  startSpan(traceContext: TraceContext, options: SpanOptions): Span {
    const span: Span = {
      traceId: traceContext.traceId,
      spanId: this.generateSpanId(),
      parentSpanId: traceContext.spanId,
      name: options.name,
      service: options.service || this.service,
      startTime: Date.now(),
      status: 'ok',
      metadata: options.metadata,
    };

    this.activeSpans.set(span.spanId, span);
    return span;
  }

  /**
   * End a span, calculate duration, and optionally ship to X-Ray.
   */
  async endSpan(span: Span, error?: Error): Promise<Span> {
    span.endTime = Date.now();
    span.durationMs = span.endTime - span.startTime;

    if (error) {
      span.status = 'error';
      span.error = { name: error.name, message: error.message };
    }

    this.activeSpans.delete(span.spanId);
    this.completedSpans.push(span);

    if (this.xrayClient) {
      await this.xrayClient.putTraceSegment(span).catch(() => {
        /* swallow – tracing should never break the request */
      });
    }

    return span;
  }

  // ── Accessors ─────────────────────────────────────────────

  getActiveSpans(): Span[] {
    return Array.from(this.activeSpans.values());
  }

  getCompletedSpans(): Span[] {
    return [...this.completedSpans];
  }

  clearCompletedSpans(): void {
    this.completedSpans = [];
  }

  getService(): string {
    return this.service;
  }

  getSamplingRate(): number {
    return this.samplingRate;
  }

  // ── Helpers ───────────────────────────────────────────────

  private generateTraceId(): string {
    // X-Ray trace ID format: 1-<8 hex epoch>-<24 hex random>
    const epoch = Math.floor(Date.now() / 1000).toString(16).padStart(8, '0');
    const random = randomUUID().replace(/-/g, '').slice(0, 24);
    return `1-${epoch}-${random}`;
  }

  private generateSpanId(): string {
    return randomUUID().replace(/-/g, '').slice(0, 16);
  }
}
