-- ============================================================
-- Audit log enhancements for compliance and suspicious activity
-- ============================================================

-- Add columns for sensitive data tracking and suspicious activity flagging
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS is_sensitive BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS is_suspicious BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS suspicious_reason TEXT;

-- Index for filtering sensitive and suspicious entries
CREATE INDEX IF NOT EXISTS idx_audit_logs_sensitive ON audit_logs(is_sensitive) WHERE is_sensitive = TRUE;
CREATE INDEX IF NOT EXISTS idx_audit_logs_suspicious ON audit_logs(is_suspicious) WHERE is_suspicious = TRUE;
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id, timestamp DESC);

-- Retention policy: audit logs are retained for minimum 3 years.
-- The table uses ON DELETE SET NULL for tenant_id so logs survive tenant deletion.
-- A scheduled job should archive logs older than 3 years (not delete).
COMMENT ON TABLE audit_logs IS 'Immutable audit trail. Retain for minimum 3 years. Do not DELETE rows.';
