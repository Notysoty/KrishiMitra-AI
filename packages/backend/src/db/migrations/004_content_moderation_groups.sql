-- Content moderation queue
CREATE TABLE IF NOT EXISTS content_moderation_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  article_id UUID NOT NULL REFERENCES knowledge_articles(id) ON DELETE CASCADE,
  content_snapshot TEXT NOT NULL,
  confidence_score DECIMAL(5, 4),
  sources TEXT[],
  status VARCHAR(20) NOT NULL DEFAULT 'queued',
  reviewer_id UUID REFERENCES users(id),
  reviewer_notes TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMP
);

ALTER TABLE content_moderation_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON content_moderation_queue
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE INDEX idx_moderation_queue_status ON content_moderation_queue(tenant_id, status, created_at DESC);
CREATE INDEX idx_moderation_queue_article ON content_moderation_queue(article_id);

-- Farmer groups
CREATE TABLE IF NOT EXISTS farmer_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  field_officer_id UUID NOT NULL REFERENCES users(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  member_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE farmer_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON farmer_groups
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE INDEX idx_farmer_groups_officer ON farmer_groups(field_officer_id);

-- Group members
CREATE TABLE IF NOT EXISTS group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES farmer_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  phone VARCHAR(20) NOT NULL,
  name VARCHAR(255) NOT NULL,
  joined_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(group_id, user_id)
);

CREATE INDEX idx_group_members_group ON group_members(group_id);
CREATE INDEX idx_group_members_user ON group_members(user_id);

-- Broadcast messages
CREATE TABLE IF NOT EXISTS broadcast_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES farmer_groups(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  total_recipients INTEGER NOT NULL DEFAULT 0,
  delivered_count INTEGER NOT NULL DEFAULT 0,
  viewed_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_broadcast_messages_group ON broadcast_messages(group_id, created_at DESC);

-- Message delivery tracking
CREATE TABLE IF NOT EXISTS message_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id UUID NOT NULL REFERENCES broadcast_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  delivered_at TIMESTAMP,
  viewed_at TIMESTAMP,
  UNIQUE(broadcast_id, user_id)
);

CREATE INDEX idx_message_deliveries_broadcast ON message_deliveries(broadcast_id);
