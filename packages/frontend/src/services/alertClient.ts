/**
 * Alert API client for push notifications and price alerts.
 * Validates: Requirements 34.4, 35.6
 */

import { getToken, refreshToken } from './authClient';

const BASE_URL = process.env.REACT_APP_API_URL ?? 'http://localhost:3000';

export interface Alert {
  id: string;
  type: string;
  title: string;
  message: string;
  priority: 'low' | 'medium' | 'high';
  read: boolean;
  created_at: string;
  data?: Record<string, unknown>;
}

export interface AlertPreferences {
  priceAlerts: boolean;
  weatherAlerts: boolean;
  schemeAlerts: boolean;
  channels: ('push' | 'sms' | 'whatsapp')[];
  language: string;
}

export interface PriceAlertConfig {
  crop: string;
  market: string;
  condition: 'above' | 'below';
  threshold: number;
}

async function alertFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (res.status === 401) {
    const refreshed = await refreshToken();
    if (refreshed.success && refreshed.token) {
      headers['Authorization'] = `Bearer ${refreshed.token}`;
      return fetch(`${BASE_URL}${path}`, { ...options, headers });
    }
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  return res;
}

export async function getAlerts(): Promise<Alert[]> {
  const res = await alertFetch('/api/v1/alerts');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.alerts ?? data ?? [];
}

export async function acknowledgeAlert(id: string): Promise<void> {
  const res = await alertFetch(`/api/v1/alerts/${id}/acknowledge`, { method: 'PUT' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export async function getAlertHistory(): Promise<Alert[]> {
  const res = await alertFetch('/api/v1/alerts/history');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.alerts ?? data ?? [];
}

export async function createPriceAlert(data: PriceAlertConfig): Promise<{ id: string }> {
  const res = await alertFetch('/api/v1/markets/alerts', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function getAlertPreferences(): Promise<AlertPreferences> {
  const res = await alertFetch('/api/v1/alerts/preferences');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function updateAlertPreferences(prefs: Partial<AlertPreferences>): Promise<AlertPreferences> {
  const res = await alertFetch('/api/v1/alerts/preferences', {
    method: 'POST',
    body: JSON.stringify(prefs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
