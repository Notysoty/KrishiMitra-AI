import React from 'react';
import { AlertNotification } from '../services/marketClient';

interface Props {
  notifications: AlertNotification[];
}

const priorityColors: Record<string, { bg: string; border: string; text: string }> = {
  high: { bg: '#ffebee', border: '#ef9a9a', text: '#c62828' },
  medium: { bg: '#fff3e0', border: '#ffb74d', text: '#e65100' },
  low: { bg: '#e8f5e9', border: '#a5d6a7', text: '#2e7d32' },
};

export const AlertNotifications: React.FC<Props> = ({ notifications }) => {
  if (notifications.length === 0) {
    return <div data-testid="no-notifications">No alert notifications.</div>;
  }

  return (
    <div data-testid="alert-notifications" style={{ padding: 16 }}>
      <h3>Alert Notifications</h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {notifications.map((notif) => {
          const colors = priorityColors[notif.priority] || priorityColors.low;
          return (
            <div
              key={notif.id}
              data-testid={`notification-${notif.id}`}
              role="alert"
              style={{
                padding: '10px 14px',
                border: `1px solid ${colors.border}`,
                borderRadius: 8,
                backgroundColor: colors.bg,
                opacity: notif.read ? 0.7 : 1,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span data-testid={`notif-title-${notif.id}`} style={{ fontWeight: 600, fontSize: 14, color: colors.text }}>
                  {notif.title}
                </span>
                <span
                  data-testid={`notif-priority-${notif.id}`}
                  style={{
                    padding: '2px 8px',
                    borderRadius: 8,
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#fff',
                    backgroundColor: colors.text,
                  }}
                >
                  {notif.priority.charAt(0).toUpperCase() + notif.priority.slice(1)}
                </span>
              </div>

              <div data-testid={`notif-message-${notif.id}`} style={{ marginTop: 4, fontSize: 13 }}>
                {notif.message}
              </div>

              <div data-testid={`notif-actionable-${notif.id}`} style={{ marginTop: 6, padding: '6px 10px', backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: 4, fontSize: 12, color: '#333' }}>
                💡 {notif.actionable_info}
              </div>

              <div style={{ marginTop: 4, fontSize: 11, color: '#888' }}>
                {new Date(notif.created_at).toLocaleString('en-IN')}
                {notif.read && <span style={{ marginLeft: 8 }}>✓ Read</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
