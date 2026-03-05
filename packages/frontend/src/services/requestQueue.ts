/**
 * Offline request queue with max 50 queued actions.
 * Validates: Requirements 34.4, 34.5
 */

export interface QueuedRequest {
  id: string;
  url: string;
  method: string;
  body?: string;
  headers?: Record<string, string>;
  timestamp: number;
  status: 'pending' | 'syncing' | 'failed';
}

const MAX_QUEUE_SIZE = 50;
const STORAGE_KEY = 'krishimitra-request-queue';

function loadQueue(): QueuedRequest[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveQueue(queue: QueuedRequest[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
}

export function getQueue(): QueuedRequest[] {
  return loadQueue();
}

export function getQueueSize(): number {
  return loadQueue().length;
}

export interface EnqueueResult {
  success: boolean;
  warning?: string;
  id?: string;
}

export function enqueue(
  url: string,
  method: string,
  body?: string,
  headers?: Record<string, string>
): EnqueueResult {
  const queue = loadQueue();

  if (queue.length >= MAX_QUEUE_SIZE) {
    return {
      success: false,
      warning: 'Too many queued actions. Please connect to internet to sync.',
    };
  }

  const id = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const request: QueuedRequest = {
    id,
    url,
    method,
    body,
    headers,
    timestamp: Date.now(),
    status: 'pending',
  };

  queue.push(request);
  saveQueue(queue);

  const warning =
    queue.length >= 40
      ? `${queue.length} of ${MAX_QUEUE_SIZE} queued actions used. Connect to internet soon.`
      : undefined;

  return { success: true, id, warning };
}

export function dequeue(id: string): void {
  const queue = loadQueue().filter((r) => r.id !== id);
  saveQueue(queue);
}

export function updateStatus(id: string, status: QueuedRequest['status']): void {
  const queue = loadQueue();
  const item = queue.find((r) => r.id === id);
  if (item) {
    item.status = status;
    saveQueue(queue);
  }
}

export function clearQueue(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function getPendingRequests(): QueuedRequest[] {
  return loadQueue().filter((r) => r.status === 'pending');
}

export function getFailedRequests(): QueuedRequest[] {
  return loadQueue().filter((r) => r.status === 'failed');
}
