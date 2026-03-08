-- 007_disease_history.sql
-- Persisted disease detection records for Crop Health Timeline (T3-7)

CREATE TABLE IF NOT EXISTS disease_detections (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL,
  user_id        UUID NOT NULL,
  crop_type      VARCHAR(100) NOT NULL,
  image_s3_key   VARCHAR(500),
  disease_name   VARCHAR(200),
  confidence     DECIMAL(5,4),
  severity       VARCHAR(50),
  treatment_plan TEXT,
  detected_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_disease_detections_user   ON disease_detections(user_id,   detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_disease_detections_tenant ON disease_detections(tenant_id, detected_at DESC);
