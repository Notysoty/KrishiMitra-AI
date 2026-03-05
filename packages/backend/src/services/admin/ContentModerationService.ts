import { getPool } from '../../db/pool';
import { ContentModerationStatus, ArticleStatus } from '../../types/enums';
import { KnowledgeArticle } from '../../types/knowledge';
import {
  ContentModerationItem,
  ModerationQueueFilters,
  ModerationDecision,
  ModerationStats,
} from '../../types/moderation';

const OUTDATED_THRESHOLD_MONTHS = 12;

/** Prohibited words for automated content filtering */
const PROHIBITED_WORDS = [
  'explosive', 'bomb', 'weapon', 'illegal', 'self-harm', 'suicide',
];

export class ContentModerationService {

  // ── Queue AI-generated content for review ───────────────────

  async queueForReview(
    tenantId: string,
    articleId: string,
    contentSnapshot: string,
    confidenceScore?: number,
    sources?: string[],
  ): Promise<ContentModerationItem> {
    const pool = getPool();

    const id = crypto.randomUUID();
    const result = await pool.query(
      `INSERT INTO content_moderation_queue
         (id, tenant_id, article_id, content_snapshot, confidence_score, sources, status, version, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 1, NOW())
       RETURNING *`,
      [id, tenantId, articleId, contentSnapshot, confidenceScore ?? null, sources ?? null, ContentModerationStatus.QUEUED],
    );

    // Also set the article status to pending_review
    await pool.query(
      `UPDATE knowledge_articles SET status = $1, updated_at = NOW()
       WHERE id = $2 AND tenant_id = $3`,
      [ArticleStatus.PENDING_REVIEW, articleId, tenantId],
    );

    return this.mapRowToModerationItem(result.rows[0]);
  }

  // ── Get moderation queue ────────────────────────────────────

  async getQueue(
    tenantId: string,
    filters: ModerationQueueFilters = {},
  ): Promise<{ items: ContentModerationItem[]; total: number }> {
    const pool = getPool();
    const conditions: string[] = ['tenant_id = $1'];
    const params: unknown[] = [tenantId];
    let paramIdx = 2;

    if (filters.status) {
      conditions.push(`status = $${paramIdx++}`);
      params.push(filters.status);
    }

    const where = conditions.join(' AND ');
    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;

    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM content_moderation_queue WHERE ${where}`,
      params,
    );

    const result = await pool.query(
      `SELECT * FROM content_moderation_queue WHERE ${where}
       ORDER BY created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx}`,
      [...params, limit, offset],
    );

    return {
      items: result.rows.map(this.mapRowToModerationItem),
      total: parseInt(countResult.rows[0].total as string, 10),
    };
  }

  // ── Approve or reject content ───────────────────────────────

  async reviewContent(
    tenantId: string,
    decision: ModerationDecision,
    reviewerId: string,
  ): Promise<ContentModerationItem> {
    const pool = getPool();

    const existing = await pool.query(
      'SELECT * FROM content_moderation_queue WHERE id = $1 AND tenant_id = $2',
      [decision.item_id, tenantId],
    );
    if (existing.rows.length === 0) throw new Error('Moderation item not found');

    const current = existing.rows[0];
    if (current.status !== ContentModerationStatus.QUEUED) {
      throw new Error(`Item is not queued for review (current status: ${current.status})`);
    }

    const newStatus = decision.action === 'approve'
      ? ContentModerationStatus.APPROVED
      : ContentModerationStatus.REJECTED;

    const result = await pool.query(
      `UPDATE content_moderation_queue
       SET status = $1, reviewer_id = $2, reviewer_notes = $3, reviewed_at = NOW(), version = version + 1
       WHERE id = $4 AND tenant_id = $5
       RETURNING *`,
      [newStatus, reviewerId, decision.reviewer_notes ?? null, decision.item_id, tenantId],
    );

    // Update the associated article status
    const articleStatus = decision.action === 'approve'
      ? ArticleStatus.APPROVED
      : ArticleStatus.DRAFT;

    await pool.query(
      `UPDATE knowledge_articles SET status = $1, approved_by = $2, updated_at = NOW(), version = version + 1
       WHERE id = $3 AND tenant_id = $4`,
      [articleStatus, reviewerId, current.article_id, tenantId],
    );

    // Log the action
    await this.logAction(tenantId, reviewerId, `content_moderation_${decision.action}`, 'content_moderation', decision.item_id, {
      article_id: current.article_id,
      previous_status: current.status,
      new_status: newStatus,
      reviewer_notes: decision.reviewer_notes,
    });

    return this.mapRowToModerationItem(result.rows[0]);
  }

  // ── Flag outdated content (>12 months) ──────────────────────

  async flagOutdatedContent(tenantId: string): Promise<number> {
    const pool = getPool();

    const result = await pool.query(
      `UPDATE content_moderation_queue
       SET status = $1, version = version + 1
       WHERE tenant_id = $2
         AND status = $3
         AND created_at < NOW() - INTERVAL '${OUTDATED_THRESHOLD_MONTHS} months'
       RETURNING id`,
      [ContentModerationStatus.OUTDATED, tenantId, ContentModerationStatus.APPROVED],
    );

    return result.rowCount ?? 0;
  }

  // ── Automated content filtering ─────────────────────────────

  filterContent(content: string): { passed: boolean; flaggedWords: string[] } {
    const lower = content.toLowerCase();
    const flaggedWords: string[] = [];

    for (const word of PROHIBITED_WORDS) {
      if (lower.includes(word)) {
        flaggedWords.push(word);
      }
    }

    return { passed: flaggedWords.length === 0, flaggedWords };
  }

  // ── Get moderation stats ────────────────────────────────────

  async getStats(tenantId: string): Promise<ModerationStats> {
    const pool = getPool();

    const result = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'queued') as total_queued,
         COUNT(*) FILTER (WHERE status = 'approved') as total_approved,
         COUNT(*) FILTER (WHERE status = 'rejected') as total_rejected,
         COUNT(*) FILTER (WHERE status = 'outdated') as total_outdated,
         AVG(EXTRACT(EPOCH FROM (reviewed_at - created_at)) / 3600)
           FILTER (WHERE reviewed_at IS NOT NULL) as avg_review_time_hours
       FROM content_moderation_queue
       WHERE tenant_id = $1`,
      [tenantId],
    );

    const row = result.rows[0];
    return {
      total_queued: parseInt(row.total_queued as string, 10) || 0,
      total_approved: parseInt(row.total_approved as string, 10) || 0,
      total_rejected: parseInt(row.total_rejected as string, 10) || 0,
      total_outdated: parseInt(row.total_outdated as string, 10) || 0,
      avg_review_time_hours: parseFloat(row.avg_review_time_hours as string) || 0,
    };
  }

  // ── Get content version history ─────────────────────────────

  async getVersionHistory(
    tenantId: string,
    articleId: string,
  ): Promise<ContentModerationItem[]> {
    const pool = getPool();

    const result = await pool.query(
      `SELECT * FROM content_moderation_queue
       WHERE tenant_id = $1 AND article_id = $2
       ORDER BY version DESC`,
      [tenantId, articleId],
    );

    return result.rows.map(this.mapRowToModerationItem);
  }

  // ── Private helpers ─────────────────────────────────────────

  private async logAction(
    tenantId: string,
    actorId: string,
    action: string,
    resourceType: string,
    resourceId: string,
    changes?: Record<string, unknown>,
  ): Promise<void> {
    try {
      const pool = getPool();
      await pool.query(
        `INSERT INTO audit_logs (id, tenant_id, user_id, action, resource_type, resource_id, changes, timestamp)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW())`,
        [tenantId, actorId, action, resourceType, resourceId, changes ? JSON.stringify(changes) : null],
      );
    } catch (err) {
      console.error('Failed to write audit log:', err);
    }
  }

  private mapRowToModerationItem(row: Record<string, unknown>): ContentModerationItem {
    return {
      id: row.id as string,
      tenant_id: row.tenant_id as string,
      article_id: row.article_id as string,
      content_snapshot: row.content_snapshot as string,
      confidence_score: row.confidence_score != null ? parseFloat(row.confidence_score as string) : undefined,
      sources: row.sources != null ? (row.sources as string[]) : undefined,
      status: row.status as ContentModerationStatus,
      reviewer_id: row.reviewer_id as string | undefined,
      reviewer_notes: row.reviewer_notes as string | undefined,
      version: row.version as number,
      created_at: new Date(row.created_at as string),
      reviewed_at: row.reviewed_at ? new Date(row.reviewed_at as string) : undefined,
    };
  }
}
