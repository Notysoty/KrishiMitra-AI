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
