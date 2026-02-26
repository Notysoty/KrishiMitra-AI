import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { getPool } from './pool';

/**
 * Base repository providing tenant-aware query helpers.
 *
 * Every query executed through this class first sets the PostgreSQL
 * session variable `app.current_tenant` so that RLS policies filter
 * rows to the correct tenant automatically.
 */
export class BaseRepository {
  protected tableName: string;

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  protected get pool(): Pool {
    return getPool();
  }

  /**
   * Execute a single query within a tenant context.
   * Acquires a client, sets the tenant, runs the query, then releases.
   */
  async query<T extends QueryResultRow = QueryResultRow>(
    tenantId: string,
    text: string,
    params?: unknown[]
  ): Promise<QueryResult<T>> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL app.current_tenant = $1`, [tenantId]);
      const result = await client.query<T>(text, params);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Execute multiple statements inside a single tenant-scoped transaction.
   * The callback receives a PoolClient with the tenant already set.
   */
  async transaction<T>(
    tenantId: string,
    fn: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL app.current_tenant = $1`, [tenantId]);
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /** Find a single row by id within the tenant scope. */
  async findById<T extends QueryResultRow = QueryResultRow>(
    tenantId: string,
    id: string
  ): Promise<T | null> {
    const result = await this.query<T>(
      tenantId,
      `SELECT * FROM ${this.tableName} WHERE id = $1`,
      [id]
    );
    return result.rows[0] ?? null;
  }

  /** Find all rows for the current tenant. */
  async findAll<T extends QueryResultRow = QueryResultRow>(
    tenantId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<T[]> {
    const limit = options?.limit ?? 100;
    const offset = options?.offset ?? 0;
    const result = await this.query<T>(
      tenantId,
      `SELECT * FROM ${this.tableName} ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return result.rows;
  }

  /** Delete a row by id within the tenant scope. */
  async deleteById(tenantId: string, id: string): Promise<boolean> {
    const result = await this.query(
      tenantId,
      `DELETE FROM ${this.tableName} WHERE id = $1`,
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  }
}
