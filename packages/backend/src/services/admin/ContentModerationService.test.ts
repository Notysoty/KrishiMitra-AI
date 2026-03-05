import { ContentModerationService } from './ContentModerationService';
import { ContentModerationStatus, ArticleStatus } from '../../types/enums';

// ── Mock pg Pool ───────────────────────────────────────────────
const mockQuery = jest.fn();

jest.mock('../../db/pool', () => ({
  getPool: () => ({ query: mockQuery }),
}));

describe('ContentModerationService', () => {
  let service: ContentModerationService;

  beforeEach(() => {
    service = new ContentModerationService();
    mockQuery.mockReset();
  });

  const tenantId = 'tenant-1';
  const reviewerId = 'agronomist-1';
  const articleId = 'article-1';

  const baseModerationRow = {
    id: 'mod-1',
    tenant_id: tenantId,
    article_id: articleId,
    content_snapshot: 'How to manage wheat rust',
    confidence_score: '0.85',
    sources: ['source-1'],
    status: ContentModerationStatus.QUEUED,
    reviewer_id: null,
    reviewer_notes: null,
    version: 1,
    created_at: new Date().toISOString(),
    reviewed_at: null,
  };

  // ── queueForReview ──────────────────────────────────────────

  describe('queueForReview', () => {
    it('should queue content for review and update article status', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [baseModerationRow] }); // INSERT moderation
      mockQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE article status

      const item = await service.queueForReview(
        tenantId, articleId, 'How to manage wheat rust', 0.85, ['source-1'],
      );

      expect(item.status).toBe(ContentModerationStatus.QUEUED);
      expect(item.article_id).toBe(articleId);
      expect(item.confidence_score).toBe(0.85);
      expect(mockQuery).toHaveBeenCalledTimes(2);
      // Verify article status was updated to pending_review
      expect(mockQuery.mock.calls[1][1]).toContain(ArticleStatus.PENDING_REVIEW);
    });

    it('should handle missing optional fields', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...baseModerationRow, confidence_score: null, sources: null }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const item = await service.queueForReview(tenantId, articleId, 'Content text');

      expect(item.confidence_score).toBeUndefined();
      expect(item.sources).toBeUndefined();
    });
  });

  // ── getQueue ────────────────────────────────────────────────

  describe('getQueue', () => {
    it('should return paginated moderation queue', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '3' }] });
      mockQuery.mockResolvedValueOnce({
        rows: [baseModerationRow, { ...baseModerationRow, id: 'mod-2' }],
      });

      const result = await service.getQueue(tenantId, { limit: 2, offset: 0 });

      expect(result.total).toBe(3);
      expect(result.items).toHaveLength(2);
    });

    it('should filter by status', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '1' }] });
      mockQuery.mockResolvedValueOnce({ rows: [baseModerationRow] });

      const result = await service.getQueue(tenantId, { status: ContentModerationStatus.QUEUED });

      expect(result.total).toBe(1);
      expect(mockQuery.mock.calls[0][0]).toContain('status');
    });
  });

  // ── reviewContent ───────────────────────────────────────────

  describe('reviewContent', () => {
    it('should approve queued content', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [baseModerationRow] }); // SELECT existing
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...baseModerationRow, status: ContentModerationStatus.APPROVED, reviewer_id: reviewerId, version: 2 }],
      }); // UPDATE moderation
      mockQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE article
      mockQuery.mockResolvedValueOnce({ rows: [] }); // audit log

      const item = await service.reviewContent(tenantId, {
        item_id: 'mod-1', action: 'approve',
      }, reviewerId);

      expect(item.status).toBe(ContentModerationStatus.APPROVED);
      expect(item.version).toBe(2);
    });

    it('should reject queued content', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [baseModerationRow] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...baseModerationRow, status: ContentModerationStatus.REJECTED, reviewer_id: reviewerId, reviewer_notes: 'Inaccurate', version: 2 }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE article
      mockQuery.mockResolvedValueOnce({ rows: [] }); // audit log

      const item = await service.reviewContent(tenantId, {
        item_id: 'mod-1', action: 'reject', reviewer_notes: 'Inaccurate',
      }, reviewerId);

      expect(item.status).toBe(ContentModerationStatus.REJECTED);
      expect(item.reviewer_notes).toBe('Inaccurate');
    });

    it('should throw when item not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        service.reviewContent(tenantId, { item_id: 'nope', action: 'approve' }, reviewerId),
      ).rejects.toThrow('Moderation item not found');
    });

    it('should throw when item is not queued', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...baseModerationRow, status: ContentModerationStatus.APPROVED }],
      });

      await expect(
        service.reviewContent(tenantId, { item_id: 'mod-1', action: 'approve' }, reviewerId),
      ).rejects.toThrow('not queued');
    });
  });

  // ── flagOutdatedContent ─────────────────────────────────────

  describe('flagOutdatedContent', () => {
    it('should flag outdated approved content', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 5, rows: Array(5).fill({ id: 'x' }) });

      const count = await service.flagOutdatedContent(tenantId);
      expect(count).toBe(5);
      expect(mockQuery.mock.calls[0][0]).toContain('12 months');
    });

    it('should return 0 when no outdated content', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });

      const count = await service.flagOutdatedContent(tenantId);
      expect(count).toBe(0);
    });
  });

  // ── filterContent ───────────────────────────────────────────

  describe('filterContent', () => {
    it('should pass clean content', () => {
      const result = service.filterContent('How to grow wheat in winter season');
      expect(result.passed).toBe(true);
      expect(result.flaggedWords).toHaveLength(0);
    });

    it('should flag prohibited words', () => {
      const result = service.filterContent('How to make an explosive fertilizer bomb');
      expect(result.passed).toBe(false);
      expect(result.flaggedWords).toContain('explosive');
      expect(result.flaggedWords).toContain('bomb');
    });

    it('should be case-insensitive', () => {
      const result = service.filterContent('ILLEGAL activities');
      expect(result.passed).toBe(false);
      expect(result.flaggedWords).toContain('illegal');
    });
  });

  // ── getStats ────────────────────────────────────────────────

  describe('getStats', () => {
    it('should return moderation statistics', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          total_queued: '10',
          total_approved: '25',
          total_rejected: '5',
          total_outdated: '3',
          avg_review_time_hours: '2.5',
        }],
      });

      const stats = await service.getStats(tenantId);
      expect(stats.total_queued).toBe(10);
      expect(stats.total_approved).toBe(25);
      expect(stats.total_rejected).toBe(5);
      expect(stats.total_outdated).toBe(3);
      expect(stats.avg_review_time_hours).toBe(2.5);
    });

    it('should handle null averages', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          total_queued: '0', total_approved: '0', total_rejected: '0',
          total_outdated: '0', avg_review_time_hours: null,
        }],
      });

      const stats = await service.getStats(tenantId);
      expect(stats.avg_review_time_hours).toBe(0);
    });
  });

  // ── getVersionHistory ───────────────────────────────────────

  describe('getVersionHistory', () => {
    it('should return version history for an article', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { ...baseModerationRow, version: 2 },
          { ...baseModerationRow, version: 1 },
        ],
      });

      const history = await service.getVersionHistory(tenantId, articleId);
      expect(history).toHaveLength(2);
      expect(history[0].version).toBe(2);
    });
  });
});
