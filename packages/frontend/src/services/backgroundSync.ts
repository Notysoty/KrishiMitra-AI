/**
 * Background sync service — replays queued requests when connectivity returns.
 * Validates: Requirements 34.5, 34.9
 */

import { getPendingRequests, dequeue, updateStatus, type QueuedRequest } from './requestQueue';

export interface SyncResult {
  total: number;
  succeeded: number;
  failed: number;
  results: { id: string; ok: boolean; error?: string }[];
}

async function replayRequest(req: QueuedRequest): Promise<boolean> {
  try {
    updateStatus(req.id, 'syncing');
    const response = await fetch(req.url, {
      method: req.method,
      body: req.body,
      headers: req.headers,
    });
    if (response.ok) {
      dequeue(req.id);
      return true;
    }
    updateStatus(req.id, 'failed');
    return false;
  } catch {
    updateStatus(req.id, 'failed');
    return false;
  }
}

export async function syncAll(): Promise<SyncResult> {
  const pending = getPendingRequests();
  const results: SyncResult['results'] = [];

  for (const req of pending) {
    const ok = await replayRequest(req);
    results.push({ id: req.id, ok, error: ok ? undefined : 'Request failed' });
  }

  return {
    total: pending.length,
    succeeded: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}

// ── Web Push Subscription ─────────────────────────────────────

const BASE_URL = process.env.REACT_APP_API_URL ?? 'http://localhost:3000';

export async function setupPushNotifications(): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

  try {
    // Get VAPID public key from backend
    const keyRes = await fetch(`${BASE_URL}/api/v1/alerts/vapid-public-key`);
    if (!keyRes.ok) return; // Push not configured on server

    const { publicKey } = await keyRes.json() as { publicKey: string };

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey).buffer as ArrayBuffer,
      });
    }

    // Send subscription to backend
    const { getToken } = await import('./authClient');
    const token = getToken();
    await fetch(`${BASE_URL}/api/v1/alerts/push-subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(subscription.toJSON()),
    });
  } catch {
    // Push not supported or permission denied — graceful degradation
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

let syncListenerAttached = false;

export function startBackgroundSync(): () => void {
  if (syncListenerAttached) return () => {};

  const handler = () => {
    if (navigator.onLine) {
      syncAll();
    }
  };

  window.addEventListener('online', handler);
  syncListenerAttached = true;

  return () => {
    window.removeEventListener('online', handler);
    syncListenerAttached = false;
  };
}
