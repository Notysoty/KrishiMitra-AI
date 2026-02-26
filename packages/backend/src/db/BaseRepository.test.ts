import { BaseRepository } from './BaseRepository';
import { setPool } from './pool';
import { Pool, PoolClient } from 'pg';

function createMockClient(): jest.Mocked<PoolClient> {
  return {
    query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    release: jest.fn(),
  } as unknown as jest.Mocked<PoolClient>;
}

function createMockPool(client: jest.Mocked<PoolClient>): jest.Mocked<Pool> {
  return {
    connect: jest.fn().mockResolvedValue(client),
    query: jest.fn(),
    end: jest.fn(),
    on: jest.fn(),
  } as unknown as jest.Mocked<Pool>;
}

describe('BaseRepository', () => {
  let repo: BaseRepository;
  let mockClient: jest.Mocked<PoolClient>;
  let mockPool: jest.Mocked<Pool>;
  const tenantId = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(() => {
    mockClient = createMockClient();
    mockPool = createMockPool(mockClient);
    setPool(mockPool as unknown as Pool);
    repo = new BaseRepository('farms');
  });

  describe('query', () => {
    it('sets tenant context, executes query, and commits', async () => {
      mockClient.query
        .mockResolvedValueOnce({} as never) // BEGIN
        .mockResolvedValueOnce({} as never) // SET LOCAL
        .mockResolvedValueOnce({ rows: [{ id: '1' }], rowCount: 1 } as never) // actual query
        .mockResolvedValueOnce({} as never); // COMMIT

      const result = await repo.query(tenantId, 'SELECT * FROM farms WHERE id = $1', ['1']);
      expect(result.rows).toEqual([{ id: '1' }]);

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith(
        'SET LOCAL app.current_tenant = $1',
        [tenantId]
      );
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('rolls back on error and releases client', async () => {
      (mockClient.query as jest.Mock)
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // SET LOCAL
        .mockRejectedValueOnce(new Error('query failed')) // actual query
        .mockResolvedValueOnce({}); // ROLLBACK

      await expect(
        repo.query(tenantId, 'SELECT * FROM bad_table')
      ).rejects.toThrow('query failed');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('transaction', () => {
    it('executes callback within tenant-scoped transaction', async () => {
      mockClient.query
        .mockResolvedValueOnce({} as never) // BEGIN
        .mockResolvedValueOnce({} as never) // SET LOCAL
        .mockResolvedValueOnce({ rows: [{ id: '1' }] } as never) // callback query
        .mockResolvedValueOnce({} as never); // COMMIT

      const result = await repo.transaction(tenantId, async (client) => {
        const res = await client.query('INSERT INTO farms DEFAULT VALUES RETURNING *');
        return res.rows[0];
      });

      expect(result).toEqual({ id: '1' });
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('rolls back transaction on callback error', async () => {
      mockClient.query
        .mockResolvedValueOnce({} as never) // BEGIN
        .mockResolvedValueOnce({} as never); // SET LOCAL

      await expect(
        repo.transaction(tenantId, async () => {
          throw new Error('tx failed');
        })
      ).rejects.toThrow('tx failed');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('returns the row when found', async () => {
      const row = { id: '1', name: 'Test Farm' };
      mockClient.query
        .mockResolvedValueOnce({} as never) // BEGIN
        .mockResolvedValueOnce({} as never) // SET LOCAL
        .mockResolvedValueOnce({ rows: [row], rowCount: 1 } as never) // SELECT
        .mockResolvedValueOnce({} as never); // COMMIT

      const result = await repo.findById(tenantId, '1');
      expect(result).toEqual(row);
    });

    it('returns null when not found', async () => {
      mockClient.query
        .mockResolvedValueOnce({} as never) // BEGIN
        .mockResolvedValueOnce({} as never) // SET LOCAL
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as never) // SELECT
        .mockResolvedValueOnce({} as never); // COMMIT

      const result = await repo.findById(tenantId, 'nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('findAll', () => {
    it('returns rows with default pagination', async () => {
      const rows = [{ id: '1' }, { id: '2' }];
      mockClient.query
        .mockResolvedValueOnce({} as never) // BEGIN
        .mockResolvedValueOnce({} as never) // SET LOCAL
        .mockResolvedValueOnce({ rows, rowCount: 2 } as never) // SELECT
        .mockResolvedValueOnce({} as never); // COMMIT

      const result = await repo.findAll(tenantId);
      expect(result).toEqual(rows);
    });

    it('respects limit and offset options', async () => {
      mockClient.query
        .mockResolvedValueOnce({} as never) // BEGIN
        .mockResolvedValueOnce({} as never) // SET LOCAL
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as never) // SELECT
        .mockResolvedValueOnce({} as never); // COMMIT

      await repo.findAll(tenantId, { limit: 10, offset: 20 });

      // The third call is the actual SELECT query
      const selectCall = mockClient.query.mock.calls[2];
      expect(selectCall[1]).toEqual([10, 20]);
    });
  });

  describe('deleteById', () => {
    it('returns true when a row is deleted', async () => {
      mockClient.query
        .mockResolvedValueOnce({} as never) // BEGIN
        .mockResolvedValueOnce({} as never) // SET LOCAL
        .mockResolvedValueOnce({ rows: [], rowCount: 1 } as never) // DELETE
        .mockResolvedValueOnce({} as never); // COMMIT

      const result = await repo.deleteById(tenantId, '1');
      expect(result).toBe(true);
    });

    it('returns false when no row is deleted', async () => {
      mockClient.query
        .mockResolvedValueOnce({} as never) // BEGIN
        .mockResolvedValueOnce({} as never) // SET LOCAL
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as never) // DELETE
        .mockResolvedValueOnce({} as never); // COMMIT

      const result = await repo.deleteById(tenantId, 'nonexistent');
      expect(result).toBe(false);
    });
  });
});
