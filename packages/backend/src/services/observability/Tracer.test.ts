import { Tracer } from './Tracer';

describe('Tracer', () => {
  function createTracer(overrides: Partial<ConstructorParameters<typeof Tracer>[0]> = {}) {
    return new Tracer({ service: 'test-service', ...overrides });
  }

  // ── Trace context creation ────────────────────────────────

  describe('createTraceContext', () => {
    it('should generate a valid X-Ray format trace ID', () => {
      const tracer = createTracer();
      const ctx = tracer.createTraceContext();

      expect(ctx.traceId).toMatch(/^1-[0-9a-f]{8}-[0-9a-f]{24}$/);
      expect(ctx.spanId).toHaveLength(16);
      expect(ctx.sampled).toBe(true);
    });

    it('should generate unique trace IDs', () => {
      const tracer = createTracer();
      const ctx1 = tracer.createTraceContext();
      const ctx2 = tracer.createTraceContext();

      expect(ctx1.traceId).not.toBe(ctx2.traceId);
    });
  });

  // ── Trace header parsing ──────────────────────────────────

  describe('parseTraceHeader', () => {
    it('should parse a valid X-Ray trace header', () => {
      const tracer = createTracer();
      const header = 'Root=1-abcdef01-abcdef0123456789abcdef01;Parent=abcdef0123456789;Sampled=1';
      const ctx = tracer.parseTraceHeader(header);

      expect(ctx.traceId).toBe('1-abcdef01-abcdef0123456789abcdef01');
      expect(ctx.parentSpanId).toBe('abcdef0123456789');
      expect(ctx.sampled).toBe(true);
      expect(ctx.spanId).toHaveLength(16);
    });

    it('should handle Sampled=0', () => {
      const tracer = createTracer();
      const header = 'Root=1-abcdef01-abcdef0123456789abcdef01;Sampled=0';
      const ctx = tracer.parseTraceHeader(header);

      expect(ctx.sampled).toBe(false);
    });

    it('should create new context when header is undefined', () => {
      const tracer = createTracer();
      const ctx = tracer.parseTraceHeader(undefined);

      expect(ctx.traceId).toMatch(/^1-/);
      expect(ctx.spanId).toBeDefined();
    });

    it('should create new context when header is empty', () => {
      const tracer = createTracer();
      const ctx = tracer.parseTraceHeader('');

      expect(ctx.traceId).toMatch(/^1-/);
    });
  });

  // ── Format trace header ───────────────────────────────────

  describe('formatTraceHeader', () => {
    it('should format context into X-Ray header string', () => {
      const tracer = createTracer();
      const ctx = { traceId: '1-abc-def', spanId: 'span123', sampled: true };
      const header = tracer.formatTraceHeader(ctx);

      expect(header).toBe('Root=1-abc-def;Parent=span123;Sampled=1');
    });

    it('should set Sampled=0 when not sampled', () => {
      const tracer = createTracer();
      const ctx = { traceId: '1-abc-def', spanId: 'span123', sampled: false };
      const header = tracer.formatTraceHeader(ctx);

      expect(header).toContain('Sampled=0');
    });
  });

  // ── Span lifecycle ────────────────────────────────────────

  describe('spans', () => {
    it('should start a span and track it as active', () => {
      const tracer = createTracer();
      const ctx = tracer.createTraceContext();
      const span = tracer.startSpan(ctx, { name: 'db-query', service: 'test-service' });

      expect(span.traceId).toBe(ctx.traceId);
      expect(span.parentSpanId).toBe(ctx.spanId);
      expect(span.name).toBe('db-query');
      expect(span.status).toBe('ok');
      expect(span.startTime).toBeGreaterThan(0);
      expect(tracer.getActiveSpans()).toHaveLength(1);
    });

    it('should end a span and calculate duration', async () => {
      const tracer = createTracer();
      const ctx = tracer.createTraceContext();
      const span = tracer.startSpan(ctx, { name: 'operation', service: 'test' });

      // Small delay to ensure non-zero duration
      await new Promise((r) => setTimeout(r, 10));

      const ended = await tracer.endSpan(span);
      expect(ended.endTime).toBeDefined();
      expect(ended.durationMs).toBeGreaterThanOrEqual(0);
      expect(ended.status).toBe('ok');
      expect(tracer.getActiveSpans()).toHaveLength(0);
      expect(tracer.getCompletedSpans()).toHaveLength(1);
    });

    it('should mark span as error when error is provided', async () => {
      const tracer = createTracer();
      const ctx = tracer.createTraceContext();
      const span = tracer.startSpan(ctx, { name: 'failing-op', service: 'test' });

      const ended = await tracer.endSpan(span, new Error('db timeout'));
      expect(ended.status).toBe('error');
      expect(ended.error?.name).toBe('Error');
      expect(ended.error?.message).toBe('db timeout');
    });

    it('should send span to X-Ray client when provided', async () => {
      const mockXRay = { putTraceSegment: jest.fn().mockResolvedValue(undefined) };
      const tracer = createTracer({ xrayClient: mockXRay });
      const ctx = tracer.createTraceContext();
      const span = tracer.startSpan(ctx, { name: 'traced-op', service: 'test' });

      await tracer.endSpan(span);
      expect(mockXRay.putTraceSegment).toHaveBeenCalledTimes(1);
    });

    it('should not throw when X-Ray client fails', async () => {
      const mockXRay = { putTraceSegment: jest.fn().mockRejectedValue(new Error('network')) };
      const tracer = createTracer({ xrayClient: mockXRay });
      const ctx = tracer.createTraceContext();
      const span = tracer.startSpan(ctx, { name: 'op', service: 'test' });

      // Should not throw
      await expect(tracer.endSpan(span)).resolves.toBeDefined();
    });

    it('should include metadata in span', () => {
      const tracer = createTracer();
      const ctx = tracer.createTraceContext();
      const span = tracer.startSpan(ctx, { name: 'op', service: 'test', metadata: { key: 'val' } });

      expect(span.metadata).toEqual({ key: 'val' });
    });
  });

  // ── Sampling ──────────────────────────────────────────────

  describe('sampling', () => {
    it('should default to 100% sampling rate', () => {
      const tracer = createTracer();
      expect(tracer.getSamplingRate()).toBe(1.0);
    });

    it('should respect custom sampling rate', () => {
      const tracer = createTracer({ samplingRate: 0.5 });
      expect(tracer.getSamplingRate()).toBe(0.5);
    });
  });

  // ── Housekeeping ──────────────────────────────────────────

  describe('clearCompletedSpans', () => {
    it('should clear completed spans', async () => {
      const tracer = createTracer();
      const ctx = tracer.createTraceContext();
      const span = tracer.startSpan(ctx, { name: 'op', service: 'test' });
      await tracer.endSpan(span);

      expect(tracer.getCompletedSpans()).toHaveLength(1);
      tracer.clearCompletedSpans();
      expect(tracer.getCompletedSpans()).toHaveLength(0);
    });
  });
});
