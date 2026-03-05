import { CircuitBreaker } from './CircuitBreaker';
import { CircuitState } from '../../types/resilience';

describe('CircuitBreaker', () => {
  // ── State transitions ─────────────────────────────────────

  describe('state transitions', () => {
    it('should start in closed state', () => {
      const cb = new CircuitBreaker();
      expect(cb.getState()).toBe(CircuitState.CLOSED);
    });

    it('should remain closed when calls succeed', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 3 });
      await cb.execute(() => Promise.resolve('ok'), () => Promise.resolve('fallback'));
      expect(cb.getState()).toBe(CircuitState.CLOSED);
      expect(cb.getFailureCount()).toBe(0);
    });

    it('should open after reaching failure threshold', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 60_000 });
      const fail = () => Promise.reject(new Error('fail'));
      const fallback = () => Promise.resolve('fallback');

      await cb.execute(fail, fallback);
      await cb.execute(fail, fallback);
      expect(cb.getState()).toBe(CircuitState.CLOSED);

      await cb.execute(fail, fallback);
      expect(cb.getState()).toBe(CircuitState.OPEN);
      expect(cb.getFailureCount()).toBe(3);
    });

    it('should use fallback when circuit is open', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 60_000 });
      const fail = () => Promise.reject(new Error('fail'));
      const fallback = () => Promise.resolve('cached');

      await cb.execute(fail, fallback);
      expect(cb.getState()).toBe(CircuitState.OPEN);

      const result = await cb.execute(
        () => Promise.resolve('should not run'),
        fallback,
      );
      expect(result).toBe('cached');
    });

    it('should transition to half-open after reset timeout', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 50 });
      const fail = () => Promise.reject(new Error('fail'));
      const fallback = () => Promise.resolve('fallback');

      await cb.execute(fail, fallback);
      expect(cb.getState()).toBe(CircuitState.OPEN);

      // Wait for reset timeout
      await new Promise((r) => setTimeout(r, 60));

      // Next call should attempt half-open
      const result = await cb.execute(
        () => Promise.resolve('recovered'),
        fallback,
      );
      expect(result).toBe('recovered');
      expect(cb.getState()).toBe(CircuitState.CLOSED);
    });

    it('should re-open on failure during half-open', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 50 });
      const fail = () => Promise.reject(new Error('fail'));
      const fallback = () => Promise.resolve('fallback');

      await cb.execute(fail, fallback);
      expect(cb.getState()).toBe(CircuitState.OPEN);

      await new Promise((r) => setTimeout(r, 60));

      const result = await cb.execute(fail, fallback);
      expect(result).toBe('fallback');
      expect(cb.getState()).toBe(CircuitState.OPEN);
    });
  });

  // ── Fallback behaviour ────────────────────────────────────

  describe('fallback', () => {
    it('should call fallback on individual failures before threshold', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 5 });
      const result = await cb.execute(
        () => Promise.reject(new Error('oops')),
        () => Promise.resolve('safe'),
      );
      expect(result).toBe('safe');
    });

    it('should return primary result on success', async () => {
      const cb = new CircuitBreaker();
      const result = await cb.execute(
        () => Promise.resolve(42),
        () => Promise.resolve(0),
      );
      expect(result).toBe(42);
    });
  });

  // ── Reset ─────────────────────────────────────────────────

  describe('reset', () => {
    it('should reset state to closed', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 1 });
      await cb.execute(
        () => Promise.reject(new Error('fail')),
        () => Promise.resolve('fb'),
      );
      expect(cb.getState()).toBe(CircuitState.OPEN);

      cb.reset();
      expect(cb.getState()).toBe(CircuitState.CLOSED);
      expect(cb.getFailureCount()).toBe(0);
    });
  });

  // ── Success resets failure count ──────────────────────────

  describe('success resets failure count', () => {
    it('should reset failure count on success in closed state', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 5 });
      const fail = () => Promise.reject(new Error('fail'));
      const fallback = () => Promise.resolve('fb');

      await cb.execute(fail, fallback);
      await cb.execute(fail, fallback);
      expect(cb.getFailureCount()).toBe(2);

      await cb.execute(() => Promise.resolve('ok'), fallback);
      expect(cb.getFailureCount()).toBe(0);
    });
  });
});
