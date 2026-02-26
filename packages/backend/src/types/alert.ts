import { AlertType, AlertPriority, AlertStatus } from './enums';

export interface Alert {
  id: string;
  user_id: string;
  type: AlertType;
  title: string;
  message: string;
  priority: AlertPriority;
  status: AlertStatus;
  created_at: Date;
  read_at?: Date;
  acknowledged_at?: Date;
  data?: Record<string, unknown>;
}

export interface AlertPreferences {
  user_id: string;
  in_app: boolean;
  sms: boolean;
  email: boolean;
  price_alerts: boolean;
  weather_alerts: boolean;
  pest_alerts: boolean;
}
