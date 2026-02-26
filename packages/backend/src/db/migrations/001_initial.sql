-- 001_initial.sql
-- KrishiMitra-AI: Initial database schema
-- Creates all core tables, RLS policies, indexes, and pgvector extension

-- Enable pgvector extension for RAG embeddings (MVP vector store)
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- Tenants table (root entity, no RLS - platform-level)
-- ============================================================
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  branding JSONB DEFAULT '{}',
  settings JSONB DEFAULT '{}',
  limits JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Users table (tenant-scoped with RLS)
-- ============================================================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phone VARCHAR(20) NOT NULL,
  email VARCHAR(255),
  name VARCHAR(255) NOT NULL,
  roles TEXT[] NOT NULL DEFAULT '{}',
  language_preference VARCHAR(10) NOT NULL DEFAULT 'en',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login TIMESTAMPTZ,
  CONSTRAINT users_phone_tenant_unique UNIQUE (tenant_id, phone)
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_users ON users
  USING (tenant_id = current_setting('app.current_tenant')::uuid);


-- ============================================================
-- Farms table (tenant-scoped with RLS)
-- ============================================================
CREATE TABLE farms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  location JSONB NOT NULL,
  total_acreage DECIMAL(10, 2) NOT NULL,
  irrigation_type VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE farms ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_farms ON farms
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

-- ============================================================
-- Crops table
-- ============================================================
CREATE TABLE crops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  crop_type VARCHAR(100) NOT NULL,
  variety VARCHAR(100),
  acreage DECIMAL(10, 2) NOT NULL,
  planting_date DATE NOT NULL,
  expected_harvest_date DATE,
  actual_harvest_date DATE,
  status VARCHAR(50) NOT NULL DEFAULT 'planned',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Input logs table (water, fertilizer, pesticide, labor)
-- ============================================================
CREATE TABLE input_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  crop_id UUID REFERENCES crops(id) ON DELETE SET NULL,
  input_type VARCHAR(50) NOT NULL,
  quantity DECIMAL(10, 2) NOT NULL,
  unit VARCHAR(20) NOT NULL,
  cost DECIMAL(10, 2),
  date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Yield records table
-- ============================================================
CREATE TABLE yield_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  farm_id UUID NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  crop_id UUID NOT NULL REFERENCES crops(id) ON DELETE CASCADE,
  quantity DECIMAL(10, 2) NOT NULL,
  unit VARCHAR(20) NOT NULL,
  harvest_date DATE NOT NULL,
  quality_grade VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Market prices table (global, not tenant-scoped)
-- ============================================================
CREATE TABLE market_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_name VARCHAR(255) NOT NULL,
  crop VARCHAR(100) NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  unit VARCHAR(20) NOT NULL,
  date DATE NOT NULL,
  source VARCHAR(255) NOT NULL,
  location JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (market_name, crop, date)
);

CREATE INDEX idx_market_prices_crop_date ON market_prices(crop, date DESC);


-- ============================================================
-- Knowledge articles table (tenant-scoped with RLS)
-- ============================================================
CREATE TABLE knowledge_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  content TEXT NOT NULL,
  language VARCHAR(10) NOT NULL,
  category VARCHAR(100) NOT NULL,
  tags TEXT[] DEFAULT '{}',
  source VARCHAR(255) NOT NULL,
  source_url VARCHAR(500),
  status VARCHAR(50) NOT NULL DEFAULT 'draft',
  created_by UUID NOT NULL REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  embedding vector(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1
);

ALTER TABLE knowledge_articles ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_knowledge_articles ON knowledge_articles
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

-- ============================================================
-- Conversations table (tenant-scoped with RLS)
-- ============================================================
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  messages JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_conversations ON conversations
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

-- ============================================================
-- Alerts table
-- ============================================================
CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  priority VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'unread',
  data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ
);

CREATE INDEX idx_alerts_user_status ON alerts(user_id, status, created_at DESC);

-- ============================================================
-- Alert preferences table
-- ============================================================
CREATE TABLE alert_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  in_app BOOLEAN NOT NULL DEFAULT true,
  sms BOOLEAN NOT NULL DEFAULT false,
  email BOOLEAN NOT NULL DEFAULT false,
  price_alerts BOOLEAN NOT NULL DEFAULT true,
  weather_alerts BOOLEAN NOT NULL DEFAULT true,
  pest_alerts BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Audit logs table (preserved on tenant deletion for compliance)
-- ============================================================
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  user_id UUID NOT NULL,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(100) NOT NULL,
  resource_id VARCHAR(255) NOT NULL,
  changes JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id, timestamp DESC);

-- ============================================================
-- ETL jobs table (platform-level)
-- ============================================================
CREATE TABLE etl_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  source VARCHAR(255) NOT NULL,
  records_processed INTEGER NOT NULL DEFAULT 0,
  records_failed INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Schema migrations tracking table
-- ============================================================
CREATE TABLE schema_migrations (
  id SERIAL PRIMARY KEY,
  filename VARCHAR(255) NOT NULL UNIQUE,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
