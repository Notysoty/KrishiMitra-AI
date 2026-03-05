import { ContentModerationStatus } from './enums';

export interface ContentModerationItem {
  id: string;
  tenant_id: string;
  article_id: string;
  content_snapshot: string;
  confidence_score?: number;
  sources?: string[];
  status: ContentModerationStatus;
  reviewer_id?: string;
  reviewer_notes?: string;
  version: number;
  created_at: Date;
  reviewed_at?: Date;
}

export interface ModerationQueueFilters {
  status?: ContentModerationStatus;
  limit?: number;
  offset?: number;
}

export interface ModerationDecision {
  item_id: string;
  action: 'approve' | 'reject';
  reviewer_notes?: string;
}

export interface ModerationStats {
  total_queued: number;
  total_approved: number;
  total_rejected: number;
  total_outdated: number;
  avg_review_time_hours: number;
}
