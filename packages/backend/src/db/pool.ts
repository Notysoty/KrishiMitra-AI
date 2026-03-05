import { Pool, PoolConfig, QueryConfig, QueryResult } from 'pg';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';

let pool: Pool | null = null;

// ── Slow query logging ────────────────────────────────────────

/** Threshold in milliseconds above which a query is considered slow (Requirement 33.6). */
export const SLOW_QUERY_THRESHOLD_MS = 2_000;

export interface SlowQueryLog {
  timestamp: string;
  query: string;
  durationMs: number;
}

/** Callback invoked when a slow query is detected. Override in tests or for custom handling. */
let slowQueryCallback: ((log: SlowQueryLog) => void) | null = null;

export function setSlowQueryCallback(cb: ((log: SlowQueryLog) => void) | null): void {
  slowQueryCallback = cb;
}

/**
 * Wrap a pool query call with timing and slow-query detection.
 * Logs a warning when the query exceeds SLOW_QUERY_THRESHOLD_MS.
 */
export async function timedQuery(
  queryText: string | QueryConfig,
  values?: unknown[],
): Promise<QueryResult> {
  const p = getPool();
  const start = Date.now();
  const result = await (values !== undefined
    ? p.query(queryText as string, values)
    : p.query(queryText as string | QueryConfig));
  const durationMs = Date.now() - start;

  if (durationMs > SLOW_QUERY_THRESHOLD_MS) {
    const text = typeof queryText === 'string' ? queryText : queryText.text;
    const log: SlowQueryLog = {
      timestamp: new Date().toISOString(),
      query: text,
      durationMs,
    };
    console.warn(
      JSON.stringify({
        level: 'WARN',
        message: 'Slow database query detected',
        ...log,
      }),
    );
    if (slowQueryCallback) {
      slowQueryCallback(log);
    }
  }

  return result;
}

interface DbCredentials {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
}

const DEFAULT_POOL_CONFIG: Partial<PoolConfig> = {
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
};

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1_000;

async function loadCredentialsFromSecretsManager(): Promise<DbCredentials> {
  const secretName = process.env.DB_SECRET_NAME;
  const region = process.env.AWS_REGION || 'ap-south-1';

  if (!secretName) {
    throw new Error('DB_SECRET_NAME environment variable is required');
  }

  const client = new SecretsManagerClient({ region });
  const command = new GetSecretValueCommand({ SecretId: secretName });
  const response = await client.send(command);

  if (!response.SecretString) {
    throw new Error('Secret value is empty');
  }

  return JSON.parse(response.SecretString) as DbCredentials;
}

function buildPoolConfig(creds: DbCredentials): PoolConfig {
  return {
    host: creds.host,
    port: creds.port,
    database: creds.database,
    user: creds.username,
    password: creds.password,
    ssl: process.env.DB_SSL === 'false' ? false : { rejectUnauthorized: true },
    ...DEFAULT_POOL_CONFIG,
  };
}

function buildPoolFromEnv(): PoolConfig {
  const connectionString =
    process.env.DATABASE_URL ||
    'postgresql://postgres:postgres@localhost:5432/krishimitra';

  return {
    connectionString,
    ...DEFAULT_POOL_CONFIG,
  };
}

async function connectWithRetry(config: PoolConfig): Promise<Pool> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const p = new Pool(config);
      // Verify the connection works
      const client = await p.connect();
      client.release();
      return p;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(
        `Database connection attempt ${attempt}/${MAX_RETRIES} failed: ${lastError.message}`
      );
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(
    `Failed to connect to database after ${MAX_RETRIES} attempts: ${lastError?.message}`
  );
}

export async function initPool(): Promise<Pool> {
  if (pool) return pool;

  let config: PoolConfig;

  if (process.env.DB_SECRET_NAME) {
    const creds = await loadCredentialsFromSecretsManager();
    config = buildPoolConfig(creds);
  } else {
    config = buildPoolFromEnv();
  }

  pool = await connectWithRetry(config);

  pool.on('error', (err) => {
    console.error('Unexpected pool error:', err.message);
  });

  return pool;
}

export function getPool(): Pool {
  if (!pool) {
    throw new Error('Database pool not initialized. Call initPool() first.');
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

// Allow tests to inject a mock pool
export function setPool(p: Pool): void {
  pool = p;
}
