/**
 * Hook for detecting connection status: Online / Offline / Slow.
 * Validates: Requirements 34.1, 34.8
 */

import { useState, useEffect, useCallback } from 'react';

export type ConnectionStatus = 'online' | 'offline' | 'slow';

export interface ConnectionInfo {
  status: ConnectionStatus;
  since: number;
}

function detectSlow(): boolean {
  const nav = navigator as Navigator & {
    connection?: { downlink?: number; effectiveType?: string };
  };
  const conn = nav.connection;
  if (!conn) return false;
  if (conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g') return true;
  if (typeof conn.downlink === 'number' && conn.downlink < 0.5) return true;
  return false;
}

function getStatus(): ConnectionStatus {
  if (!navigator.onLine) return 'offline';
  if (detectSlow()) return 'slow';
  return 'online';
}

export function useConnectionStatus(): ConnectionInfo {
  const [info, setInfo] = useState<ConnectionInfo>(() => ({
    status: getStatus(),
    since: Date.now(),
  }));

  const update = useCallback(() => {
    setInfo((prev) => {
      const next = getStatus();
      if (next === prev.status) return prev;
      return { status: next, since: Date.now() };
    });
  }, []);

  useEffect(() => {
    window.addEventListener('online', update);
    window.addEventListener('offline', update);

    const nav = navigator as Navigator & { connection?: EventTarget };
    const conn = nav.connection;
    if (conn) {
      conn.addEventListener('change', update);
    }

    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
      if (conn) {
        conn.removeEventListener('change', update);
      }
    };
  }, [update]);

  return info;
}
