import { initPool, getPool, closePool, setPool } from './pool';
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
