import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

function getPool(): Pool {
  const connectionString =
    process.env.DATABASE_URL ||
    'postgresql://postgres:postgres@localhost:5432/krishimitra';
  const isLocal =
    connectionString.includes('localhost') ||
    connectionString.includes('127.0.0.1');
  return new Pool({
    connectionString,
    // Skip CA verification for RDS (Amazon CA not in Alpine trust store; safe within private VPC)
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });
}

async function ensureMigrationsTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getAppliedMigrations(pool: Pool): Promise<Set<string>> {
  const result = await pool.query(
    'SELECT filename FROM schema_migrations ORDER BY id'
  );
  return new Set(result.rows.map((r: { filename: string }) => r.filename));
}

function getMigrationFiles(): string[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    return [];
  }
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

export async function runMigrations(): Promise<void> {
  const pool = getPool();

  try {
    await ensureMigrationsTable(pool);
    const applied = await getAppliedMigrations(pool);
    const files = getMigrationFiles();
    const pending = files.filter((f) => !applied.has(f));

    if (pending.length === 0) {
      console.log('No pending migrations.');
      return;
    }

    for (const file of pending) {
      console.log(`Applying migration: ${file}`);
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (filename) VALUES ($1)',
          [file]
        );
        await client.query('COMMIT');
        console.log(`Applied: ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`Failed to apply migration ${file}:`, err);
        throw err;
      } finally {
        client.release();
      }
    }

    console.log(`Applied ${pending.length} migration(s).`);
  } finally {
    await pool.end();
  }
}

// Run directly via: npx ts-node src/db/migrate.ts
if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
