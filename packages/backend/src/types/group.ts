import { BroadcastStatus, MessageDeliveryStatus } from './enums';

export interface FarmerGroup {
  id: string;
  tenant_id: string;
  field_officer_id: string;
  name: string;
  description?: string;
  member_count: number;
  created_at: Date;
  updated_at: Date;
}

export interface GroupMember {
  id: string;
  group_id: string;
  user_id: string;
  phone: string;
  name: string;
  joined_at: Date;
}

export interface BroadcastMessage {
  id: string;
  group_id: string;
  sender_id: string;
  content: string;
  status: BroadcastStatus;
  total_recipients: number;
  delivered_count: number;
  viewed_count: number;
  created_at: Date;
}

export interface MessageDelivery {
  id: string;
  broadcast_id: string;
  user_id: string;
  status: MessageDeliveryStatus;
  delivered_at?: Date;
  viewed_at?: Date;
}

export interface GroupAnalytics {
  group_id: string;
  group_name: string;
  total_members: number;
  total_broadcasts: number;
  avg_delivery_rate: number;
  avg_view_rate: number;
}

export interface GroupExportData {
  group: FarmerGroup;
  members: GroupMember[];
  broadcasts: BroadcastMessage[];
}

export const MAX_GROUP_SIZE = 100;
