import * as fs from 'fs';
import * as path from 'path';

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

describe('Database migrations', () => {
  test('migration files exist and are ordered', () => {
    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    expect(files.length).toBeGreaterThan(0);
    expect(files[0]).toBe('001_initial.sql');
  });

  test('001_initial.sql contains all required tables', () => {
    const sql = fs.readFileSync(
      path.join(MIGRATIONS_DIR, '001_initial.sql'),
      'utf-8'
    );

    const requiredTables = [
      'tenants',
      'users',
      'farms',
      'crops',
      'input_logs',
      'yield_records',
      'market_prices',
      'knowledge_articles',
      'conversations',
      'alerts',
      'alert_preferences',
      'audit_logs',
      'etl_jobs',
    ];

    for (const table of requiredTables) {
      expect(sql).toContain(`CREATE TABLE ${table}`);
    }
  });

  test('RLS is enabled on tenant-scoped tables', () => {
    const sql = fs.readFileSync(
      path.join(MIGRATIONS_DIR, '001_initial.sql'),
      'utf-8'
    );

    const rlsTables = ['users', 'farms', 'knowledge_articles', 'conversations'];

    for (const table of rlsTables) {
      expect(sql).toContain(
        `ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`
      );
      expect(sql).toMatch(
        new RegExp(`CREATE POLICY tenant_isolation_${table} ON ${table}`)
      );
    }
  });

  test('RLS policies use current_setting for tenant isolation', () => {
    const sql = fs.readFileSync(
      path.join(MIGRATIONS_DIR, '001_initial.sql'),
      'utf-8'
    );

    const policyMatches = sql.match(/CREATE POLICY tenant_isolation/g);
    expect(policyMatches).not.toBeNull();
    expect(policyMatches!.length).toBe(4);

    // All policies should use current_setting('app.current_tenant')
    const settingMatches = sql.match(
      /current_setting\('app\.current_tenant'\)::uuid/g
    );
    expect(settingMatches).not.toBeNull();
    expect(settingMatches!.length).toBe(4);
  });

  test('required indexes are created', () => {
    const sql = fs.readFileSync(
      path.join(MIGRATIONS_DIR, '001_initial.sql'),
      'utf-8'
    );

    expect(sql).toContain('CREATE INDEX idx_market_prices_crop_date');
    expect(sql).toContain('CREATE INDEX idx_alerts_user_status');
    expect(sql).toContain('CREATE INDEX idx_audit_logs_timestamp');
    expect(sql).toContain('CREATE INDEX idx_audit_logs_user');
  });

  test('pgvector extension is enabled', () => {
    const sql = fs.readFileSync(
      path.join(MIGRATIONS_DIR, '001_initial.sql'),
      'utf-8'
    );

    expect(sql).toContain("CREATE EXTENSION IF NOT EXISTS vector");
  });

  test('knowledge_articles has vector embedding column', () => {
    const sql = fs.readFileSync(
      path.join(MIGRATIONS_DIR, '001_initial.sql'),
      'utf-8'
    );

    expect(sql).toContain('embedding vector(1536)');
  });

  test('audit_logs uses ON DELETE SET NULL for tenant_id (compliance preservation)', () => {
    const sql = fs.readFileSync(
      path.join(MIGRATIONS_DIR, '001_initial.sql'),
      'utf-8'
    );

    // audit_logs.tenant_id should SET NULL on tenant deletion to preserve logs
    expect(sql).toMatch(
      /audit_logs[\s\S]*?tenant_id UUID REFERENCES tenants\(id\) ON DELETE SET NULL/
    );
  });
});

describe('Migration runner module', () => {
  test('exports runMigrations function', () => {
    const migrate = require('./migrate');
    expect(typeof migrate.runMigrations).toBe('function');
  });
});
