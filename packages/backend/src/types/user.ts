import { Role } from './enums';

export interface User {
  id: string;
  tenant_id: string;
  phone: string;
  email?: string;
  name: string;
  roles: Role[];
  language_preference: string;
  created_at: Date;
  last_login?: Date;
}
