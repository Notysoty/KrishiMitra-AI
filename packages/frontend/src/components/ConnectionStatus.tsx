/**
 * Connection status indicator component.
 * Shows Online / Offline / Slow with appropriate styling.
 * Validates: Requirements 34.8
 */

import React from 'react';
import { useConnectionStatus, type ConnectionStatus as Status } from '../hooks/useConnectionStatus';

const STATUS_CONFIG: Record<Status, { label: string; color: string; bg: string }> = {
  online: { label: 'Online', color: '#2e7d32', bg: '#e8f5e9' },
  offline: { label: 'Offline', color: '#c62828', bg: '#ffebee' },
  slow: { label: 'Slow Connection', color: '#e65100', bg: '#fff3e0' },
};

export interface ConnectionStatusProps {
  className?: string;
}

export const ConnectionStatusIndicator: React.FC<ConnectionStatusProps> = ({ className }) => {
  const { status } = useConnectionStatus();
  const config = STATUS_CONFIG[status];

  const style: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 12px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: 600,
    color: config.color,
    backgroundColor: config.bg,
  };

  const dotStyle: React.CSSProperties = {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: config.color,
  };

  return (
    <div className={className} style={style} role="status" aria-live="polite" data-testid="connection-status">
      <span style={dotStyle} aria-hidden="true" />
      {config.label}
    </div>
  );
};
