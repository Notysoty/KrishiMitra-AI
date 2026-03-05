import { initPool, getPool, closePool, setPool, timedQuery, SLOW_QUERY_THRESHOLD_MS, setSlowQueryCallback } from './pool';
import { Pool } from 'pg';

// Mock AWS SDK
jest.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: jest.fn().mockImplementation(() => ({
    send: jest.fn().mockResolvedValue({
      SecretString: JSON.stringify({
        host: 'localhost',
        port: 5432,
        database: 'test',
        username: 'user',
        password: 'pass',
      }),
    }),
  })),
  GetSecretValueCommand: jest.fn(),
}));

// Mock pg Pool
jest.mock('pg', () => {
  const mockClient = {
    release: jest.fn(),
  };
  const mockPool = {
    connect: jest.fn().mockResolvedValue(mockClient),
    end: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    query: jest.fn(),
  };
  return {
    Pool: jest.fn(() => mockPool),
  };
});

describe('pool', () => {
  beforeEach(async () => {
    await closePool();
    delete process.env.DB_SECRET_NAME;
    delete process.env.DATABASE_URL;
  });

  describe('getPool', () => {
    it('throws when pool is not initialized', () => {
      expect(() => getPool()).toThrow('Database pool not initialized');
    });
  });

  describe('initPool', () => {
    it('creates a pool using DATABASE_URL when DB_SECRET_NAME is not set', async () => {
      process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/testdb';
      const pool = await initPool();
      expect(pool).toBeDefined();
      expect(pool.connect).toHaveBeenCalled();
    });

    it('returns the same pool on subsequent calls', async () => {
      const pool1 = await initPool();
      const pool2 = await initPool();
      expect(pool1).toBe(pool2);
    });

    it('creates a pool using Secrets Manager when DB_SECRET_NAME is set', async () => {
      process.env.DB_SECRET_NAME = 'test-secret';
      const pool = await initPool();
      expect(pool).toBeDefined();
    });
  });

  describe('closePool', () => {
    it('ends the pool and resets state', async () => {
      const pool = await initPool();
      await closePool();
      expect(pool.end).toHaveBeenCalled();
      expect(() => getPool()).toThrow();
    });

    it('is safe to call when no pool exists', async () => {
      await expect(closePool()).resolves.not.toThrow();
    });
  });

  describe('setPool', () => {
    it('allows injecting a mock pool', () => {
      const mockPool = { query: jest.fn() } as unknown as Pool;
      setPool(mockPool);
      expect(getPool()).toBe(mockPool);
    });
  });
});

// ── timedQuery / slow query logging ──────────────────────────

describe('timedQuery', () => {
  const mockQuery = jest.fn();

  beforeEach(() => {
    const mockPool = { query: mockQuery, connect: jest.fn(), end: jest.fn(), on: jest.fn() } as unknown as Pool;
    setPool(mockPool);
    setSlowQueryCallback(null);
    mockQuery.mockReset();
  });

  afterEach(() => {
    setSlowQueryCallback(null);
  });

  it('returns query result', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }], rowCount: 1 });
    const result = await timedQuery('SELECT 1');
    expect(result.rows).toEqual([{ id: 1 }]);
  });

  it('passes values to pool.query', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await timedQuery('SELECT * FROM farms WHERE id = $1', ['farm-1']);
    expect(mockQuery).toHaveBeenCalledWith('SELECT * FROM farms WHERE id = $1', ['farm-1']);
  });

  it('SLOW_QUERY_THRESHOLD_MS is 2000ms', () => {
    expect(SLOW_QUERY_THRESHOLD_MS).toBe(2000);
  });

  it('invokes slow query callback when query exceeds threshold', async () => {
    // Simulate a slow query by making pool.query take longer than threshold
    mockQuery.mockImplementationOnce(async () => {
      // We can't actually wait 2s in tests; instead we mock Date.now
      return { rows: [], rowCount: 0 };
    });

    const slowLogs: unknown[] = [];
    setSlowQueryCallback((log) => slowLogs.push(log));

    // Patch Date.now to simulate elapsed time
    const realDateNow = Date.now;
    let callCount = 0;
    jest.spyOn(Date, 'now').mockImplementation(() => {
      callCount++;
      // First call (start): 0, second call (end): 3000ms later
      return callCount === 1 ? 0 : 3000;
    });

    await timedQuery('SELECT slow_query()');

    expect(slowLogs).toHaveLength(1);
    expect((slowLogs[0] as { durationMs: number }).durationMs).toBe(3000);

    jest.spyOn(Date, 'now').mockRestore();
  });

  it('does not invoke callback for fast queries', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const slowLogs: unknown[] = [];
    setSlowQueryCallback((log) => slowLogs.push(log));

    // Fast query: both Date.now calls return same value
    jest.spyOn(Date, 'now').mockReturnValue(1000);

    await timedQuery('SELECT fast_query()');

    expect(slowLogs).toHaveLength(0);

    jest.spyOn(Date, 'now').mockRestore();
  });
});

