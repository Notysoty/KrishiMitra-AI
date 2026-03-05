import { syncAll, startBackgroundSync } from './backgroundSync';
import * as queue from './requestQueue';

// Mock localStorage for requestQueue
const store: Record<string, string> = {};
beforeEach(() => {
  Object.keys(store).forEach((k) => delete store[k]);
  jest.spyOn(Storage.prototype, 'getItem').mockImplementation((key) => store[key] ?? null);
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation((key, val) => {
    store[key] = val;
  });
  jest.spyOn(Storage.prototype, 'removeItem').mockImplementation((key) => {
    delete store[key];
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('backgroundSync', () => {
  it('syncAll replays pending requests successfully', async () => {
    queue.enqueue('/api/test', 'POST', '{"x":1}');

    global.fetch = jest.fn().mockResolvedValue({ ok: true });

    const result = await syncAll();
    expect(result.total).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(0);
    expect(queue.getQueueSize()).toBe(0);
  });

  it('syncAll marks failed requests', async () => {
    queue.enqueue('/api/fail', 'POST');

    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });

    const result = await syncAll();
    expect(result.total).toBe(1);
    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(1);
    expect(queue.getFailedRequests()).toHaveLength(1);
  });

  it('syncAll handles network errors gracefully', async () => {
    queue.enqueue('/api/error', 'POST');

    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

    const result = await syncAll();
    expect(result.failed).toBe(1);
  });

  it('syncAll returns empty result when no pending requests', async () => {
    const result = await syncAll();
    expect(result.total).toBe(0);
    expect(result.succeeded).toBe(0);
    expect(result.failed).toBe(0);
  });

  it('startBackgroundSync attaches online listener and returns cleanup', () => {
    const addSpy = jest.spyOn(window, 'addEventListener');
    const removeSpy = jest.spyOn(window, 'removeEventListener');

    const cleanup = startBackgroundSync();
    expect(addSpy).toHaveBeenCalledWith('online', expect.any(Function));

    cleanup();
    expect(removeSpy).toHaveBeenCalledWith('online', expect.any(Function));
  });
});
