import { getPool } from '../../db/pool';
import { BroadcastStatus, MessageDeliveryStatus } from '../../types/enums';
import {
  FarmerGroup,
  GroupMember,
  BroadcastMessage,
  GroupAnalytics,
  GroupExportData,
  MAX_GROUP_SIZE,
} from '../../types/group';

export { MAX_GROUP_SIZE };

export class GroupService {

  // ── Create group ────────────────────────────────────────────

  async createGroup(
    tenantId: string,
    fieldOfficerId: string,
    name: string,
    description?: string,
  ): Promise<FarmerGroup> {
    const pool = getPool();
    const id = crypto.randomUUID();

    const result = await pool.query(
      `INSERT INTO farmer_groups (id, tenant_id, field_officer_id, name, description, member_count, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 0, NOW(), NOW())
       RETURNING *`,
      [id, tenantId, fieldOfficerId, name, description ?? null],
    );

    await this.logAction(tenantId, fieldOfficerId, 'create_group', 'farmer_group', id, { name });

    return this.mapRowToGroup(result.rows[0]);
  }

  // ── Add farmer by phone ─────────────────────────────────────

  async addFarmerByPhone(
    tenantId: string,
    groupId: string,
    phone: string,
    actorId: string,
  ): Promise<GroupMember> {
    const pool = getPool();

    // Verify group exists and belongs to this tenant
    const group = await pool.query(
      'SELECT * FROM farmer_groups WHERE id = $1 AND tenant_id = $2',
      [groupId, tenantId],
    );
    if (group.rows.length === 0) throw new Error('Group not found');

    // Check group size limit
    const currentCount = parseInt(group.rows[0].member_count as string, 10);
    if (currentCount >= MAX_GROUP_SIZE) {
      throw new Error(`Group has reached the maximum size of ${MAX_GROUP_SIZE} members`);
    }

    // Find user by phone
    const user = await pool.query(
      'SELECT id, phone, name FROM users WHERE phone = $1 AND tenant_id = $2',
      [phone, tenantId],
    );
    if (user.rows.length === 0) throw new Error('User not found with this phone number');

    const userId = user.rows[0].id as string;
    const userName = user.rows[0].name as string;

    // Check if already a member
    const existing = await pool.query(
      'SELECT id FROM group_members WHERE group_id = $1 AND user_id = $2',
      [groupId, userId],
    );
    if (existing.rows.length > 0) throw new Error('User is already a member of this group');

    const memberId = crypto.randomUUID();
    const memberResult = await pool.query(
      `INSERT INTO group_members (id, group_id, user_id, phone, name, joined_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING *`,
      [memberId, groupId, userId, phone, userName],
    );

    // Update member count
    await pool.query(
      'UPDATE farmer_groups SET member_count = member_count + 1, updated_at = NOW() WHERE id = $1',
      [groupId],
    );

    await this.logAction(tenantId, actorId, 'add_group_member', 'farmer_group', groupId, {
      user_id: userId, phone,
    });

    return this.mapRowToMember(memberResult.rows[0]);
  }

  // ── Remove farmer from group ────────────────────────────────

  async removeFarmer(
    tenantId: string,
    groupId: string,
    userId: string,
    actorId: string,
  ): Promise<boolean> {
    const pool = getPool();

    // Verify group exists
    const group = await pool.query(
      'SELECT id FROM farmer_groups WHERE id = $1 AND tenant_id = $2',
      [groupId, tenantId],
    );
    if (group.rows.length === 0) throw new Error('Group not found');

    const result = await pool.query(
      'DELETE FROM group_members WHERE group_id = $1 AND user_id = $2 RETURNING id',
      [groupId, userId],
    );

    if ((result.rowCount ?? 0) === 0) return false;

    await pool.query(
      'UPDATE farmer_groups SET member_count = GREATEST(member_count - 1, 0), updated_at = NOW() WHERE id = $1',
      [groupId],
    );

    await this.logAction(tenantId, actorId, 'remove_group_member', 'farmer_group', groupId, {
      user_id: userId,
    });

    return true;
  }

  // ── List groups for a field officer ─────────────────────────

  async listGroups(
    tenantId: string,
    fieldOfficerId: string,
    options: { limit?: number; offset?: number } = {},
  ): Promise<{ groups: FarmerGroup[]; total: number }> {
    const pool = getPool();
    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;

    const countResult = await pool.query(
      'SELECT COUNT(*) as total FROM farmer_groups WHERE tenant_id = $1 AND field_officer_id = $2',
      [tenantId, fieldOfficerId],
    );

    const result = await pool.query(
      `SELECT * FROM farmer_groups WHERE tenant_id = $1 AND field_officer_id = $2
       ORDER BY created_at DESC LIMIT $3 OFFSET $4`,
      [tenantId, fieldOfficerId, limit, offset],
    );

    return {
      groups: result.rows.map(this.mapRowToGroup),
      total: parseInt(countResult.rows[0].total as string, 10),
    };
  }

  // ── Get group members ───────────────────────────────────────

  async getMembers(
    tenantId: string,
    groupId: string,
  ): Promise<GroupMember[]> {
    const pool = getPool();

    // Verify group belongs to tenant
    const group = await pool.query(
      'SELECT id FROM farmer_groups WHERE id = $1 AND tenant_id = $2',
      [groupId, tenantId],
    );
    if (group.rows.length === 0) throw new Error('Group not found');

    const result = await pool.query(
      'SELECT * FROM group_members WHERE group_id = $1 ORDER BY joined_at ASC',
      [groupId],
    );

    return result.rows.map(this.mapRowToMember);
  }

  // ── Broadcast message ───────────────────────────────────────

  async broadcastMessage(
    tenantId: string,
    groupId: string,
    senderId: string,
    content: string,
  ): Promise<BroadcastMessage> {
    const pool = getPool();

    // Verify group exists
    const group = await pool.query(
      'SELECT * FROM farmer_groups WHERE id = $1 AND tenant_id = $2',
      [groupId, tenantId],
    );
    if (group.rows.length === 0) throw new Error('Group not found');

    // Get all members
    const members = await pool.query(
      'SELECT user_id FROM group_members WHERE group_id = $1',
      [groupId],
    );

    const totalRecipients = members.rows.length;
    if (totalRecipients === 0) throw new Error('Group has no members');

    const broadcastId = crypto.randomUUID();

    // Create broadcast record
    const broadcastResult = await pool.query(
      `INSERT INTO broadcast_messages (id, group_id, sender_id, content, status, total_recipients, delivered_count, viewed_count, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 0, 0, NOW())
       RETURNING *`,
      [broadcastId, groupId, senderId, content, BroadcastStatus.SENT, totalRecipients],
    );

    // Create delivery records for each member
    let deliveredCount = 0;
    for (const member of members.rows) {
      const deliveryId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO message_deliveries (id, broadcast_id, user_id, status, delivered_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [deliveryId, broadcastId, member.user_id, MessageDeliveryStatus.DELIVERED],
      );
      deliveredCount++;
    }

    // Update delivered count
    await pool.query(
      'UPDATE broadcast_messages SET delivered_count = $1 WHERE id = $2',
      [deliveredCount, broadcastId],
    );

    await this.logAction(tenantId, senderId, 'broadcast_message', 'farmer_group', groupId, {
      broadcast_id: broadcastId,
      total_recipients: totalRecipients,
    });

    return this.mapRowToBroadcast({
      ...broadcastResult.rows[0],
      delivered_count: deliveredCount,
    });
  }

  // ── Mark message as viewed ──────────────────────────────────

  async markMessageViewed(
    broadcastId: string,
    userId: string,
  ): Promise<boolean> {
    const pool = getPool();

    const result = await pool.query(
      `UPDATE message_deliveries SET status = $1, viewed_at = NOW()
       WHERE broadcast_id = $2 AND user_id = $3 AND status != $1
       RETURNING id`,
      [MessageDeliveryStatus.VIEWED, broadcastId, userId],
    );

    if ((result.rowCount ?? 0) > 0) {
      await pool.query(
        'UPDATE broadcast_messages SET viewed_count = viewed_count + 1 WHERE id = $1',
        [broadcastId],
      );
      return true;
    }

    return false;
  }

  // ── Get broadcast delivery tracking ─────────────────────────

  async getDeliveryTracking(
    tenantId: string,
    groupId: string,
    broadcastId: string,
  ): Promise<{ broadcast: BroadcastMessage; deliveries: Array<{ user_id: string; status: string; delivered_at?: Date; viewed_at?: Date }> }> {
    const pool = getPool();

    // Verify group belongs to tenant
    const group = await pool.query(
      'SELECT id FROM farmer_groups WHERE id = $1 AND tenant_id = $2',
      [groupId, tenantId],
    );
    if (group.rows.length === 0) throw new Error('Group not found');

    const broadcastResult = await pool.query(
      'SELECT * FROM broadcast_messages WHERE id = $1 AND group_id = $2',
      [broadcastId, groupId],
    );
    if (broadcastResult.rows.length === 0) throw new Error('Broadcast not found');

    const deliveries = await pool.query(
      'SELECT user_id, status, delivered_at, viewed_at FROM message_deliveries WHERE broadcast_id = $1',
      [broadcastId],
    );

    return {
      broadcast: this.mapRowToBroadcast(broadcastResult.rows[0]),
      deliveries: deliveries.rows.map(r => ({
        user_id: r.user_id as string,
        status: r.status as string,
        delivered_at: r.delivered_at ? new Date(r.delivered_at as string) : undefined,
        viewed_at: r.viewed_at ? new Date(r.viewed_at as string) : undefined,
      })),
    };
  }

  // ── Group analytics ─────────────────────────────────────────

  async getGroupAnalytics(
    tenantId: string,
    groupId: string,
  ): Promise<GroupAnalytics> {
    const pool = getPool();

    const group = await pool.query(
      'SELECT * FROM farmer_groups WHERE id = $1 AND tenant_id = $2',
      [groupId, tenantId],
    );
    if (group.rows.length === 0) throw new Error('Group not found');

    const broadcastStats = await pool.query(
      `SELECT
         COUNT(*) as total_broadcasts,
         AVG(CASE WHEN total_recipients > 0 THEN delivered_count::decimal / total_recipients ELSE 0 END) as avg_delivery_rate,
         AVG(CASE WHEN total_recipients > 0 THEN viewed_count::decimal / total_recipients ELSE 0 END) as avg_view_rate
       FROM broadcast_messages
       WHERE group_id = $1`,
      [groupId],
    );

    const stats = broadcastStats.rows[0];
    return {
      group_id: groupId,
      group_name: group.rows[0].name as string,
      total_members: parseInt(group.rows[0].member_count as string, 10),
      total_broadcasts: parseInt(stats.total_broadcasts as string, 10) || 0,
      avg_delivery_rate: parseFloat(stats.avg_delivery_rate as string) || 0,
      avg_view_rate: parseFloat(stats.avg_view_rate as string) || 0,
    };
  }

  // ── Export group data ───────────────────────────────────────

  async exportGroupData(
    tenantId: string,
    groupId: string,
  ): Promise<GroupExportData> {
    const pool = getPool();

    const group = await pool.query(
      'SELECT * FROM farmer_groups WHERE id = $1 AND tenant_id = $2',
      [groupId, tenantId],
    );
    if (group.rows.length === 0) throw new Error('Group not found');

    const members = await pool.query(
      'SELECT * FROM group_members WHERE group_id = $1 ORDER BY joined_at ASC',
      [groupId],
    );

    const broadcasts = await pool.query(
      'SELECT * FROM broadcast_messages WHERE group_id = $1 ORDER BY created_at DESC',
      [groupId],
    );

    return {
      group: this.mapRowToGroup(group.rows[0]),
      members: members.rows.map(this.mapRowToMember),
      broadcasts: broadcasts.rows.map(this.mapRowToBroadcast),
    };
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

  private mapRowToGroup(row: Record<string, unknown>): FarmerGroup {
    return {
      id: row.id as string,
      tenant_id: row.tenant_id as string,
      field_officer_id: row.field_officer_id as string,
      name: row.name as string,
      description: row.description as string | undefined,
      member_count: parseInt(row.member_count as string, 10),
      created_at: new Date(row.created_at as string),
      updated_at: new Date(row.updated_at as string),
    };
  }

  private mapRowToMember(row: Record<string, unknown>): GroupMember {
    return {
      id: row.id as string,
      group_id: row.group_id as string,
      user_id: row.user_id as string,
      phone: row.phone as string,
      name: row.name as string,
      joined_at: new Date(row.joined_at as string),
    };
  }

  private mapRowToBroadcast(row: Record<string, unknown>): BroadcastMessage {
    return {
      id: row.id as string,
      group_id: row.group_id as string,
      sender_id: row.sender_id as string,
      content: row.content as string,
      status: row.status as BroadcastStatus,
      total_recipients: parseInt(row.total_recipients as string, 10),
      delivered_count: parseInt(row.delivered_count as string, 10),
      viewed_count: parseInt(row.viewed_count as string, 10),
      created_at: new Date(row.created_at as string),
    };
  }
}
