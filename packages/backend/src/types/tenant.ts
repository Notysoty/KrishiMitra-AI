import { TenantType, TenantStatus } from './enums';

export interface Tenant {
  id: string;
  name: string;
  type: TenantType;
  status: TenantStatus;
  branding: {
    logo_url?: string;
    primary_color?: string;
    secondary_color?: string;
  };
  settings: {
    supported_languages: string[];
    supported_crops: string[];
    supported_markets: string[];
    default_region: string;
  };
  limits: {
    max_users: number;
    max_storage_gb: number;
    max_api_requests_per_day: number;
  };
  created_at: Date;
  updated_at: Date;
}
