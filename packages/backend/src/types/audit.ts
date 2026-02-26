export interface AuditLog {
  id: string;
  tenant_id?: string;
  user_id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  changes?: Record<string, unknown>;
  ip_address?: string;
  user_agent?: string;
  timestamp: Date;
}
