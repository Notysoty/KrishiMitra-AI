import React from 'react';
import { useConnectionStatus, type ConnectionStatus as Status } from '../hooks/useConnectionStatus';

const STATUS_LABELS: Record<Status, string> = {
  online: 'Online',
  offline: 'Offline',
  slow: 'Slow Connection',
};

export interface ConnectionStatusProps {
  className?: string;
}

export const ConnectionStatusIndicator: React.FC<ConnectionStatusProps> = ({ className }) => {
  const { status } = useConnectionStatus();

  return (
    <div
      className={`connection-indicator ${status}${className ? ` ${className}` : ''}`}
      role="status"
      aria-live="polite"
      data-testid="connection-status"
    >
      <span className="dot" aria-hidden="true" />
      {STATUS_LABELS[status]}
    </div>
  );
};
