import request from 'supertest';
import express from 'express';
import { ContentModerationStatus } from '../types/enums';

// ── Mocks ──────────────────────────────────────────────────────

const mockServiceInstance = {
  queueForReview: jest.fn(),
  getQueue: jest.fn(),
  reviewContent: jest.fn(),
  flagOutdatedContent: jest.fn(),
  filterContent: jest.fn(),
  getStats: jest.fn(),
  getVersionHistory: jest.fn(),
};

jest.mock('../services/admin/ContentModerationService', () => ({
  ContentModerationService: jest.fn().mockImplementation(() => mockServiceInstance),
}));

jest.mock('../services/auth', () => ({
  verifyToken: () => ({
    userId: 'agronomist-1',
    tenantId: 'tenant-1',
    roles: ['agronomist'],
    sessionId: 'session-1',
  }),
}));

import moderationRoutes from './moderation';

const app = express();
app.use(express.json());
app.use('/api/v1/moderation', moderationRoutes);

describe('Moderation Routes', () => {
  const authHeader = { Authorization: 'Bearer valid-token' };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const baseItem = {
    id: 'mod-1',
    tenant_id: 'tenant-1',
    article_id: 'article-1',
    content_snapshot: 'Wheat rust management',
    confidence_score: 0.85,
    status: ContentModerationStatus.QUEUED,
    version: 1,
    created_at: new Date(),
  };

  // ── POST /queue ───────────────────────────────────────────

  describe('POST /api/v1/moderation/queue', () => {
    it('should queue content for review', async () => {
      mockServiceInstance.filterContent.mockReturnValue({ passed: true, flaggedWords: [] });
      mockServiceInstance.queueForReview.mockResolvedValue(baseItem);

      const res = await request(app)
        .post('/api/v1/moderation/queue')
        .set(authHeader)
        .send({ article_id: 'article-1', content_snapshot: 'Wheat rust management' });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe(ContentModerationStatus.QUEUED);
    });

    it('should reject content with prohibited words', async () => {
      mockServiceInstance.filterContent.mockReturnValue({ passed: false, flaggedWords: ['explosive'] });

      const res = await request(app)
        .post('/api/v1/moderation/queue')
        .set(authHeader)
        .send({ article_id: 'article-1', content_snapshot: 'explosive content' });

      expect(res.status).toBe(400);
      expect(res.body.flagged_words).toContain('explosive');
    });

    it('should reject missing required fields', async () => {
      const res = await request(app)
        .post('/api/v1/moderation/queue')
        .set(authHeader)
        .send({ article_id: 'article-1' });

      expect(res.status).toBe(400);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/v1/moderation/queue')
        .send({ article_id: 'article-1', content_snapshot: 'test' });

      expect(res.status).toBe(401);
    });
  });

  // ── GET /queue ────────────────────────────────────────────

  describe('GET /api/v1/moderation/queue', () => {
    it('should return moderation queue', async () => {
      mockServiceInstance.getQueue.mockResolvedValue({ items: [baseItem], total: 1 });

      const res = await request(app)
        .get('/api/v1/moderation/queue')
        .set(authHeader);

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
    });

    it('should pass filter parameters', async () => {
      mockServiceInstance.getQueue.mockResolvedValue({ items: [], total: 0 });

      const res = await request(app)
        .get('/api/v1/moderation/queue?status=queued&limit=10&offset=0')
        .set(authHeader);

      expect(res.status).toBe(200);
      expect(mockServiceInstance.getQueue).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({ status: 'queued', limit: 10, offset: 0 }),
      );
    });
  });

  // ── POST /review ──────────────────────────────────────────

  describe('POST /api/v1/moderation/review', () => {
    it('should approve content', async () => {
      mockServiceInstance.reviewContent.mockResolvedValue({
        ...baseItem, status: ContentModerationStatus.APPROVED,
      });

      const res = await request(app)
        .post('/api/v1/moderation/review')
        .set(authHeader)
        .send({ item_id: 'mod-1', action: 'approve' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(ContentModerationStatus.APPROVED);
    });

    it('should reject invalid action', async () => {
      const res = await request(app)
        .post('/api/v1/moderation/review')
        .set(authHeader)
        .send({ item_id: 'mod-1', action: 'invalid' });

      expect(res.status).toBe(400);
    });

    it('should return 404 when item not found', async () => {
      mockServiceInstance.reviewContent.mockRejectedValue(new Error('Moderation item not found'));

      const res = await request(app)
        .post('/api/v1/moderation/review')
        .set(authHeader)
        .send({ item_id: 'nope', action: 'approve' });

      expect(res.status).toBe(404);
    });

    it('should return 400 when item not queued', async () => {
      mockServiceInstance.reviewContent.mockRejectedValue(new Error('Item is not queued for review'));

      const res = await request(app)
        .post('/api/v1/moderation/review')
        .set(authHeader)
        .send({ item_id: 'mod-1', action: 'approve' });

      expect(res.status).toBe(400);
    });
  });

  // ── POST /flag-outdated ───────────────────────────────────

  describe('POST /api/v1/moderation/flag-outdated', () => {
    it('should flag outdated content', async () => {
      mockServiceInstance.flagOutdatedContent.mockResolvedValue(3);

      const res = await request(app)
        .post('/api/v1/moderation/flag-outdated')
        .set(authHeader);

      expect(res.status).toBe(200);
      expect(res.body.flagged_count).toBe(3);
    });
  });

  // ── GET /stats ────────────────────────────────────────────

  describe('GET /api/v1/moderation/stats', () => {
    it('should return moderation stats', async () => {
      mockServiceInstance.getStats.mockResolvedValue({
        total_queued: 10, total_approved: 25, total_rejected: 5,
        total_outdated: 3, avg_review_time_hours: 2.5,
      });

      const res = await request(app)
        .get('/api/v1/moderation/stats')
        .set(authHeader);

      expect(res.status).toBe(200);
      expect(res.body.total_queued).toBe(10);
    });
  });

  // ── GET /history/:articleId ───────────────────────────────

  describe('GET /api/v1/moderation/history/:articleId', () => {
    it('should return version history', async () => {
      mockServiceInstance.getVersionHistory.mockResolvedValue([baseItem]);

      const res = await request(app)
        .get('/api/v1/moderation/history/article-1')
        .set(authHeader);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });
  });
});
