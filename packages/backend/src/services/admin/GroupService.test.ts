import { GroupService, MAX_GROUP_SIZE } from './GroupService';
import { BroadcastStatus, MessageDeliveryStatus } from '../../types/enums';

// ── Mock pg Pool ───────────────────────────────────────────────
const mockQuery = jest.fn();

jest.mock('../../db/pool', () => ({
  getPool: () => ({ query: mockQuery }),
}));

describe('GroupService', () => {
  let service: GroupService;

  beforeEach(() => {
    service = new GroupService();
    mockQuery.mockReset();
  });

  const tenantId = 'tenant-1';
  const officerId = 'officer-1';
  const groupId = 'group-1';

  const baseGroupRow = {
    id: groupId,
    tenant_id: tenantId,
    field_officer_id: officerId,
    name: 'Wheat Farmers Group',
    description: 'Group for wheat farmers',
    member_count: '5',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const baseMemberRow = {
    id: 'member-1',
    group_id: groupId,
    user_id: 'farmer-1',
    phone: '+911234567890',
    name: 'Test Farmer',
    joined_at: new Date().toISOString(),
  };

  // ── createGroup ─────────────────────────────────────────────

  describe('createGroup', () => {
    it('should create a group and log the action', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...baseGroupRow, member_count: '0' }] }); // INSERT
      mockQuery.mockResolvedValueOnce({ rows: [] }); // audit log

      const group = await service.createGroup(tenantId, officerId, 'Wheat Farmers Group', 'Group for wheat farmers');

      expect(group.name).toBe('Wheat Farmers Group');
      expect(group.field_officer_id).toBe(officerId);
      expect(group.member_count).toBe(0);
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });
  });

  // ── addFarmerByPhone ────────────────────────────────────────

  describe('addFarmerByPhone', () => {
    it('should add a farmer to the group by phone', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [baseGroupRow] }); // SELECT group
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'farmer-1', phone: '+911234567890', name: 'Test Farmer' }] }); // SELECT user
      mockQuery.mockResolvedValueOnce({ rows: [] }); // SELECT existing member (none)
      mockQuery.mockResolvedValueOnce({ rows: [baseMemberRow] }); // INSERT member
      mockQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE member_count
      mockQuery.mockResolvedValueOnce({ rows: [] }); // audit log

      const member = await service.addFarmerByPhone(tenantId, groupId, '+911234567890', officerId);

      expect(member.phone).toBe('+911234567890');
      expect(member.name).toBe('Test Farmer');
    });

    it('should throw when group not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        service.addFarmerByPhone(tenantId, 'nonexistent', '+911234567890', officerId),
      ).rejects.toThrow('Group not found');
    });

    it('should throw when group is at max capacity', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...baseGroupRow, member_count: String(MAX_GROUP_SIZE) }] });

      await expect(
        service.addFarmerByPhone(tenantId, groupId, '+911234567890', officerId),
      ).rejects.toThrow('maximum size');
    });

    it('should throw when user not found by phone', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [baseGroupRow] }); // SELECT group
      mockQuery.mockResolvedValueOnce({ rows: [] }); // SELECT user (not found)

      await expect(
        service.addFarmerByPhone(tenantId, groupId, '+919999999999', officerId),
      ).rejects.toThrow('User not found with this phone number');
    });

    it('should throw when user is already a member', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [baseGroupRow] }); // SELECT group
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'farmer-1', phone: '+911234567890', name: 'Test Farmer' }] }); // SELECT user
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'existing-member' }] }); // SELECT existing member

      await expect(
        service.addFarmerByPhone(tenantId, groupId, '+911234567890', officerId),
      ).rejects.toThrow('already a member');
    });
  });

  // ── removeFarmer ────────────────────────────────────────────

  describe('removeFarmer', () => {
    it('should remove a farmer and update count', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: groupId }] }); // SELECT group
      mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'member-1' }] }); // DELETE member
      mockQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE count
      mockQuery.mockResolvedValueOnce({ rows: [] }); // audit log

      const result = await service.removeFarmer(tenantId, groupId, 'farmer-1', officerId);
      expect(result).toBe(true);
    });

    it('should return false when member not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: groupId }] }); // SELECT group
      mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] }); // DELETE (not found)

      const result = await service.removeFarmer(tenantId, groupId, 'nonexistent', officerId);
      expect(result).toBe(false);
    });

    it('should throw when group not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        service.removeFarmer(tenantId, 'nonexistent', 'farmer-1', officerId),
      ).rejects.toThrow('Group not found');
    });
  });

  // ── listGroups ──────────────────────────────────────────────

  describe('listGroups', () => {
    it('should return paginated groups', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '2' }] });
      mockQuery.mockResolvedValueOnce({ rows: [baseGroupRow, { ...baseGroupRow, id: 'group-2', name: 'Rice Group' }] });

      const result = await service.listGroups(tenantId, officerId, { limit: 10, offset: 0 });

      expect(result.total).toBe(2);
      expect(result.groups).toHaveLength(2);
    });
  });

  // ── getMembers ──────────────────────────────────────────────

  describe('getMembers', () => {
    it('should return group members', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: groupId }] }); // SELECT group
      mockQuery.mockResolvedValueOnce({ rows: [baseMemberRow, { ...baseMemberRow, id: 'member-2', user_id: 'farmer-2' }] });

      const members = await service.getMembers(tenantId, groupId);
      expect(members).toHaveLength(2);
    });

    it('should throw when group not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(service.getMembers(tenantId, 'nonexistent')).rejects.toThrow('Group not found');
    });
  });

  // ── broadcastMessage ────────────────────────────────────────

  describe('broadcastMessage', () => {
    it('should broadcast message to all members', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [baseGroupRow] }); // SELECT group
      mockQuery.mockResolvedValueOnce({ rows: [{ user_id: 'farmer-1' }, { user_id: 'farmer-2' }] }); // SELECT members
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'broadcast-1', group_id: groupId, sender_id: officerId,
          content: 'Important update', status: BroadcastStatus.SENT,
          total_recipients: '2', delivered_count: '0', viewed_count: '0',
          created_at: new Date().toISOString(),
        }],
      }); // INSERT broadcast
      mockQuery.mockResolvedValueOnce({ rows: [] }); // INSERT delivery 1
      mockQuery.mockResolvedValueOnce({ rows: [] }); // INSERT delivery 2
      mockQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE delivered_count
      mockQuery.mockResolvedValueOnce({ rows: [] }); // audit log

      const broadcast = await service.broadcastMessage(tenantId, groupId, officerId, 'Important update');

      expect(broadcast.content).toBe('Important update');
      expect(broadcast.total_recipients).toBe(2);
      expect(broadcast.delivered_count).toBe(2);
    });

    it('should throw when group not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        service.broadcastMessage(tenantId, 'nonexistent', officerId, 'Hello'),
      ).rejects.toThrow('Group not found');
    });

    it('should throw when group has no members', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [baseGroupRow] }); // SELECT group
      mockQuery.mockResolvedValueOnce({ rows: [] }); // SELECT members (empty)

      await expect(
        service.broadcastMessage(tenantId, groupId, officerId, 'Hello'),
      ).rejects.toThrow('Group has no members');
    });
  });

  // ── markMessageViewed ───────────────────────────────────────

  describe('markMessageViewed', () => {
    it('should mark message as viewed and update count', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'delivery-1' }] }); // UPDATE delivery
      mockQuery.mockResolvedValueOnce({ rows: [] }); // UPDATE viewed_count

      const result = await service.markMessageViewed('broadcast-1', 'farmer-1');
      expect(result).toBe(true);
    });

    it('should return false when already viewed', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0, rows: [] });

      const result = await service.markMessageViewed('broadcast-1', 'farmer-1');
      expect(result).toBe(false);
    });
  });

  // ── getDeliveryTracking ─────────────────────────────────────

  describe('getDeliveryTracking', () => {
    it('should return broadcast with delivery details', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: groupId }] }); // SELECT group
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'broadcast-1', group_id: groupId, sender_id: officerId,
          content: 'Update', status: BroadcastStatus.SENT,
          total_recipients: '2', delivered_count: '2', viewed_count: '1',
          created_at: new Date().toISOString(),
        }],
      }); // SELECT broadcast
      mockQuery.mockResolvedValueOnce({
        rows: [
          { user_id: 'farmer-1', status: MessageDeliveryStatus.VIEWED, delivered_at: new Date().toISOString(), viewed_at: new Date().toISOString() },
          { user_id: 'farmer-2', status: MessageDeliveryStatus.DELIVERED, delivered_at: new Date().toISOString(), viewed_at: null },
        ],
      }); // SELECT deliveries

      const tracking = await service.getDeliveryTracking(tenantId, groupId, 'broadcast-1');

      expect(tracking.broadcast.total_recipients).toBe(2);
      expect(tracking.deliveries).toHaveLength(2);
    });

    it('should throw when group not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        service.getDeliveryTracking(tenantId, 'nonexistent', 'broadcast-1'),
      ).rejects.toThrow('Group not found');
    });

    it('should throw when broadcast not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: groupId }] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        service.getDeliveryTracking(tenantId, groupId, 'nonexistent'),
      ).rejects.toThrow('Broadcast not found');
    });
  });

  // ── getGroupAnalytics ───────────────────────────────────────

  describe('getGroupAnalytics', () => {
    it('should return group analytics', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [baseGroupRow] }); // SELECT group
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_broadcasts: '10', avg_delivery_rate: '0.95', avg_view_rate: '0.60' }],
      }); // SELECT stats

      const analytics = await service.getGroupAnalytics(tenantId, groupId);

      expect(analytics.group_name).toBe('Wheat Farmers Group');
      expect(analytics.total_members).toBe(5);
      expect(analytics.total_broadcasts).toBe(10);
      expect(analytics.avg_delivery_rate).toBe(0.95);
      expect(analytics.avg_view_rate).toBe(0.60);
    });

    it('should throw when group not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(service.getGroupAnalytics(tenantId, 'nonexistent')).rejects.toThrow('Group not found');
    });
  });

  // ── exportGroupData ─────────────────────────────────────────

  describe('exportGroupData', () => {
    it('should export complete group data', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [baseGroupRow] }); // SELECT group
      mockQuery.mockResolvedValueOnce({ rows: [baseMemberRow] }); // SELECT members
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'broadcast-1', group_id: groupId, sender_id: officerId,
          content: 'Update', status: BroadcastStatus.SENT,
          total_recipients: '1', delivered_count: '1', viewed_count: '0',
          created_at: new Date().toISOString(),
        }],
      }); // SELECT broadcasts

      const data = await service.exportGroupData(tenantId, groupId);

      expect(data.group.name).toBe('Wheat Farmers Group');
      expect(data.members).toHaveLength(1);
      expect(data.broadcasts).toHaveLength(1);
    });

    it('should throw when group not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(service.exportGroupData(tenantId, 'nonexistent')).rejects.toThrow('Group not found');
    });
  });
});
