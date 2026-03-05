import {
  enqueue,
  dequeue,
  getQueue,
  getQueueSize,
  clearQueue,
  getPendingRequests,
  getFailedRequests,
  updateStatus,
} from './requestQueue';

// Mock localStorage
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

describe('requestQueue', () => {
  it('enqueues a request and returns success', () => {
    const result = enqueue('/api/test', 'POST', '{"a":1}');
    expect(result.success).toBe(true);
    expect(result.id).toBeDefined();
    expect(getQueueSize()).toBe(1);
  });

  it('dequeues a request by id', () => {
    const { id } = enqueue('/api/test', 'POST');
    expect(getQueueSize()).toBe(1);
    dequeue(id!);
    expect(getQueueSize()).toBe(0);
  });

  it('rejects when queue is full (50 items)', () => {
    for (let i = 0; i < 50; i++) {
      enqueue(`/api/${i}`, 'GET');
    }
    const result = enqueue('/api/overflow', 'GET');
    expect(result.success).toBe(false);
    expect(result.warning).toContain('Too many queued actions');
    expect(getQueueSize()).toBe(50);
  });

  it('warns when queue approaches limit (>=40)', () => {
    for (let i = 0; i < 40; i++) {
      enqueue(`/api/${i}`, 'GET');
    }
    const result = enqueue('/api/41', 'GET');
    expect(result.success).toBe(true);
    expect(result.warning).toContain('41 of 50');
  });

  it('clears the queue', () => {
    enqueue('/api/a', 'GET');
    enqueue('/api/b', 'GET');
    clearQueue();
    expect(getQueueSize()).toBe(0);
  });

  it('filters pending and failed requests', () => {
    const { id: id1 } = enqueue('/api/a', 'GET');
    enqueue('/api/b', 'GET');
    updateStatus(id1!, 'failed');
    expect(getPendingRequests()).toHaveLength(1);
    expect(getFailedRequests()).toHaveLength(1);
  });

  it('getQueue returns all items', () => {
    enqueue('/api/a', 'GET');
    enqueue('/api/b', 'POST', '{}');
    const queue = getQueue();
    expect(queue).toHaveLength(2);
    expect(queue[0].url).toBe('/api/a');
    expect(queue[1].method).toBe('POST');
  });
});
