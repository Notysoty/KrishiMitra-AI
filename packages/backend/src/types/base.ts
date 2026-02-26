export interface BaseEntity {
  id: string;
  tenant_id: string;
  created_at: Date;
  updated_at: Date;
}

export interface Location {
  latitude: number;
  longitude: number;
  address?: string;
  state?: string;
  district?: string;
}
