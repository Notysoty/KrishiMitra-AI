import request from 'supertest';
import express from 'express';
import { BroadcastStatus } from '../types/enums';

// ── Mocks ──────────────────────────────────────────────────────

const mockServiceInstance = {
  createGroup: jest.fn(),
  listGroups: jest.fn(),
  getMembers: jest.fn(),
  addFarmerByPhone: jest.fn(),
  removeFarmer: jest.fn(),
  broadcastMessage: jest.fn(),
  markMessageViewed: jest.fn(),
  getDeliveryTracking: jest.fn(),
  getGroupAnalytics: jest.fn(),
  exportGroupData: jest.fn(),
};

jest.mock('../services/admin/GroupService', () => ({
  GroupService: jest.fn().mockImplementation(() => mockServiceInstance),
  MAX_GROUP_SIZE: 100,
}));

jest.mock('../services/auth', () => ({
  verifyToken: () => ({
    userId: 'officer-1',
    tenantId: 'tenant-1',
    roles: ['field_officer'],
    sessionId: 'session-1',
  }),
}));

import groupRoutes from './groups';

const app = express();
app.use(express.json());
app.use('/api/v1/groups', groupRoutes);

describe('Groups Routes', () => {
  const authHeader = { Authorization: 'Bearer valid-token' };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const baseGroup = {
    id: 'group-1',
    tenant_id: 'tenant-1',
    field_officer_id: 'officer-1',
    name: 'Wheat Farmers',
    member_count: 5,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const baseMember = {
    id: 'member-1',
    group_id: 'group-1',
    user_id: 'farmer-1',
    phone: '+911234567890',
    name: 'Test Farmer',
    joined_at: new Date(),
  };

  // ── POST / ────────────────────────────────────────────────

  describe('POST /api/v1/groups', () => {
    it('should create a group', async () => {
      mockServiceInstance.createGroup.mockResolvedValue(baseGroup);

      const res = await request(app)
        .post('/api/v1/groups')
        .set(authHeader)
        .send({ name: 'Wheat Farmers', description: 'Group for wheat farmers' });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Wheat Farmers');
    });

    it('should reject missing name', async () => {
      const res = await request(app)
        .post('/api/v1/groups')
        .set(authHeader)
        .send({});

      expect(res.status).toBe(400);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/v1/groups')
        .send({ name: 'Test' });

      expect(res.status).toBe(401);
    });
  });

  // ── GET / ─────────────────────────────────────────────────

  describe('GET /api/v1/groups', () => {
    it('should list groups', async () => {
      mockServiceInstance.listGroups.mockResolvedValue({ groups: [baseGroup], total: 1 });

      const res = await request(app)
        .get('/api/v1/groups')
        .set(authHeader);

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
    });
  });

  // ── GET /:id/members ──────────────────────────────────────

  describe('GET /api/v1/groups/:id/members', () => {
    it('should return group members', async () => {
      mockServiceInstance.getMembers.mockResolvedValue([baseMember]);

      const res = await request(app)
        .get('/api/v1/groups/group-1/members')
        .set(authHeader);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });

    it('should return 404 when group not found', async () => {
      mockServiceInstance.getMembers.mockRejectedValue(new Error('Group not found'));

      const res = await request(app)
        .get('/api/v1/groups/nonexistent/members')
        .set(authHeader);

      expect(res.status).toBe(404);
    });
  });

  // ── POST /:id/members ────────────────────────────────────

  describe('POST /api/v1/groups/:id/members', () => {
    it('should add a farmer by phone', async () => {
      mockServiceInstance.addFarmerByPhone.mockResolvedValue(baseMember);

      const res = await request(app)
        .post('/api/v1/groups/group-1/members')
        .set(authHeader)
        .send({ phone: '+911234567890' });

      expect(res.status).toBe(201);
      expect(res.body.phone).toBe('+911234567890');
    });

    it('should reject missing phone', async () => {
      const res = await request(app)
        .post('/api/v1/groups/group-1/members')
        .set(authHeader)
        .send({});

      expect(res.status).toBe(400);
    });

    it('should return 404 when group not found', async () => {
      mockServiceInstance.addFarmerByPhone.mockRejectedValue(new Error('Group not found'));

      const res = await request(app)
        .post('/api/v1/groups/nonexistent/members')
        .set(authHeader)
        .send({ phone: '+911234567890' });

      expect(res.status).toBe(404);
    });

    it('should return 400 when group at max capacity', async () => {
      mockServiceInstance.addFarmerByPhone.mockRejectedValue(new Error('Group has reached the maximum size of 100 members'));

      const res = await request(app)
        .post('/api/v1/groups/group-1/members')
        .set(authHeader)
        .send({ phone: '+911234567890' });

      expect(res.status).toBe(400);
    });

    it('should return 404 when user not found', async () => {
      mockServiceInstance.addFarmerByPhone.mockRejectedValue(new Error('User not found with this phone number'));

      const res = await request(app)
        .post('/api/v1/groups/group-1/members')
        .set(authHeader)
        .send({ phone: '+919999999999' });

      expect(res.status).toBe(404);
    });

    it('should return 409 when user already a member', async () => {
      mockServiceInstance.addFarmerByPhone.mockRejectedValue(new Error('User is already a member of this group'));

      const res = await request(app)
        .post('/api/v1/groups/group-1/members')
        .set(authHeader)
        .send({ phone: '+911234567890' });

      expect(res.status).toBe(409);
    });
  });

  // ── DELETE /:id/members/:userId ───────────────────────────

  describe('DELETE /api/v1/groups/:id/members/:userId', () => {
    it('should remove a member', async () => {
      mockServiceInstance.removeFarmer.mockResolvedValue(true);

      const res = await request(app)
        .delete('/api/v1/groups/group-1/members/farmer-1')
        .set(authHeader);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 404 when member not found', async () => {
      mockServiceInstance.removeFarmer.mockResolvedValue(false);

      const res = await request(app)
        .delete('/api/v1/groups/group-1/members/nonexistent')
        .set(authHeader);

      expect(res.status).toBe(404);
    });
  });

  // ── POST /:id/broadcast ──────────────────────────────────

  describe('POST /api/v1/groups/:id/broadcast', () => {
    it('should broadcast a message', async () => {
      mockServiceInstance.broadcastMessage.mockResolvedValue({
        id: 'broadcast-1', group_id: 'group-1', sender_id: 'officer-1',
        content: 'Important update', status: BroadcastStatus.SENT,
        total_recipients: 5, delivered_count: 5, viewed_count: 0,
        created_at: new Date(),
      });

      const res = await request(app)
        .post('/api/v1/groups/group-1/broadcast')
        .set(authHeader)
        .send({ content: 'Important update' });

      expect(res.status).toBe(201);
      expect(res.body.total_recipients).toBe(5);
    });

    it('should reject missing content', async () => {
      const res = await request(app)
        .post('/api/v1/groups/group-1/broadcast')
        .set(authHeader)
        .send({});

      expect(res.status).toBe(400);
    });

    it('should return 400 when group has no members', async () => {
      mockServiceInstance.broadcastMessage.mockRejectedValue(new Error('Group has no members'));

      const res = await request(app)
        .post('/api/v1/groups/group-1/broadcast')
        .set(authHeader)
        .send({ content: 'Hello' });

      expect(res.status).toBe(400);
    });
  });

  // ── POST /broadcasts/:broadcastId/view ────────────────────

  describe('POST /api/v1/groups/broadcasts/:broadcastId/view', () => {
    it('should mark message as viewed', async () => {
      mockServiceInstance.markMessageViewed.mockResolvedValue(true);

      const res = await request(app)
        .post('/api/v1/groups/broadcasts/broadcast-1/view')
        .set(authHeader);

      expect(res.status).toBe(200);
      expect(res.body.viewed).toBe(true);
    });
  });

  // ── GET /:id/broadcasts/:broadcastId/tracking ─────────────

  describe('GET /api/v1/groups/:id/broadcasts/:broadcastId/tracking', () => {
    it('should return delivery tracking', async () => {
      mockServiceInstance.getDeliveryTracking.mockResolvedValue({
        broadcast: {
          id: 'broadcast-1', total_recipients: 2, delivered_count: 2, viewed_count: 1,
        },
        deliveries: [
          { user_id: 'farmer-1', status: 'viewed' },
          { user_id: 'farmer-2', status: 'delivered' },
        ],
      });

      const res = await request(app)
        .get('/api/v1/groups/group-1/broadcasts/broadcast-1/tracking')
        .set(authHeader);

      expect(res.status).toBe(200);
      expect(res.body.deliveries).toHaveLength(2);
    });

    it('should return 404 when group not found', async () => {
      mockServiceInstance.getDeliveryTracking.mockRejectedValue(new Error('Group not found'));

      const res = await request(app)
        .get('/api/v1/groups/nonexistent/broadcasts/broadcast-1/tracking')
        .set(authHeader);

      expect(res.status).toBe(404);
    });
  });

  // ── GET /:id/analytics ────────────────────────────────────

  describe('GET /api/v1/groups/:id/analytics', () => {
    it('should return group analytics', async () => {
      mockServiceInstance.getGroupAnalytics.mockResolvedValue({
        group_id: 'group-1', group_name: 'Wheat Farmers',
        total_members: 5, total_broadcasts: 10,
        avg_delivery_rate: 0.95, avg_view_rate: 0.60,
      });

      const res = await request(app)
        .get('/api/v1/groups/group-1/analytics')
        .set(authHeader);

      expect(res.status).toBe(200);
      expect(res.body.total_members).toBe(5);
    });

    it('should return 404 when group not found', async () => {
      mockServiceInstance.getGroupAnalytics.mockRejectedValue(new Error('Group not found'));

      const res = await request(app)
        .get('/api/v1/groups/nonexistent/analytics')
        .set(authHeader);

      expect(res.status).toBe(404);
    });
  });

  // ── GET /:id/export ───────────────────────────────────────

  describe('GET /api/v1/groups/:id/export', () => {
    it('should export group data', async () => {
      mockServiceInstance.exportGroupData.mockResolvedValue({
        group: baseGroup,
        members: [baseMember],
        broadcasts: [],
      });

      const res = await request(app)
        .get('/api/v1/groups/group-1/export')
        .set(authHeader);

      expect(res.status).toBe(200);
      expect(res.body.group.name).toBe('Wheat Farmers');
      expect(res.body.members).toHaveLength(1);
    });

    it('should return 404 when group not found', async () => {
      mockServiceInstance.exportGroupData.mockRejectedValue(new Error('Group not found'));

      const res = await request(app)
        .get('/api/v1/groups/nonexistent/export')
        .set(authHeader);

      expect(res.status).toBe(404);
    });
  });
});
