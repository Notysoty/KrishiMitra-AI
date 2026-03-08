import React from 'react';
import { AlertNotification } from '../services/marketClient';

interface Props {
  notifications: AlertNotification[];
}

const priorityBadge: Record<string, string> = {
  high: 'badge badge-red',
  medium: 'badge badge-yellow',
  low: 'badge badge-green',
};

export const AlertNotifications: React.FC<Props> = ({ notifications }) => {
  if (notifications.length === 0) {
    return <div data-testid="no-notifications" className="empty-state"><span className="empty-icon">🔕</span><span className="empty-text">No alert notifications.</span></div>;
  }

  return (
    <div data-testid="alert-notifications" className="card">
      <div className="card-header">
        <h3>📬 Alert Notifications</h3>
      </div>
      <div className="card-body">
        {notifications.map((notif) => {
          const priorityClass = notif.priority === 'high' ? 'high' : notif.priority === 'medium' ? 'medium' : 'low';
          return (
            <div
              key={notif.id}
              data-testid={`notification-${notif.id}`}
              role="alert"
              className={`notif-card ${priorityClass}`}
              style={{ opacity: notif.read ? 0.7 : 1 }}
            >
              <div className="notif-header">
                <span data-testid={`notif-title-${notif.id}`} className="notif-title">
                  {notif.title}
                </span>
                <span data-testid={`notif-priority-${notif.id}`} className={priorityBadge[notif.priority]}>
                  {notif.priority.charAt(0).toUpperCase() + notif.priority.slice(1)}
                </span>
              </div>

              <div data-testid={`notif-message-${notif.id}`} className="notif-message">
                {notif.message}
              </div>

              <div data-testid={`notif-actionable-${notif.id}`} className="notif-action">
                💡 {notif.actionable_info}
              </div>

              <div className="notif-meta">
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
