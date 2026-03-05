import { renderHook, act } from '@testing-library/react';
import { useConnectionStatus } from './useConnectionStatus';

describe('useConnectionStatus', () => {
  const originalOnLine = navigator.onLine;

  afterEach(() => {
    Object.defineProperty(navigator, 'onLine', {
      value: originalOnLine,
      writable: true,
      configurable: true,
    });
  });

  it('returns online when navigator.onLine is true', () => {
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });
    const { result } = renderHook(() => useConnectionStatus());
    expect(result.current.status).toBe('online');
    expect(result.current.since).toBeGreaterThan(0);
  });

  it('returns offline when navigator.onLine is false', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true });
    const { result } = renderHook(() => useConnectionStatus());
    expect(result.current.status).toBe('offline');
  });

  it('updates status when going offline', () => {
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });
    const { result } = renderHook(() => useConnectionStatus());
    expect(result.current.status).toBe('online');

    act(() => {
      Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true });
      window.dispatchEvent(new Event('offline'));
    });

    expect(result.current.status).toBe('offline');
  });

  it('updates status when coming back online', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true });
    const { result } = renderHook(() => useConnectionStatus());
    expect(result.current.status).toBe('offline');

    act(() => {
      Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });
      window.dispatchEvent(new Event('online'));
    });

    expect(result.current.status).toBe('online');
  });

  it('tracks since timestamp on status change', () => {
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });
    const { result } = renderHook(() => useConnectionStatus());
    const initialSince = result.current.since;

    act(() => {
      Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true });
      window.dispatchEvent(new Event('offline'));
    });

    expect(result.current.since).toBeGreaterThanOrEqual(initialSince);
  });
});
