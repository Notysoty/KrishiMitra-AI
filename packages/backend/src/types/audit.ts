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
  is_sensitive?: boolean;
  is_suspicious?: boolean;
  suspicious_reason?: string;
}

export interface AuditLogFilter {
  tenant_id?: string;
  user_id?: string;
  action?: string;
  resource_type?: string;
  start_date?: Date;
  end_date?: Date;
  is_sensitive?: boolean;
  is_suspicious?: boolean;
  limit?: number;
  offset?: number;
}

export interface AuditLogResult {
  logs: AuditLog[];
  total: number;
}

export interface SuspiciousActivityRule {
  type: string;
  threshold: number;
  window_minutes: number;
  description: string;
}
