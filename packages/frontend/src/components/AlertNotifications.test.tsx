import React from 'react';
import { render, screen } from '@testing-library/react';
import { AlertNotifications } from './AlertNotifications';
import { AlertNotification } from '../services/marketClient';

const mockNotifications: AlertNotification[] = [
  { id: 'notif-1', type: 'price_change', title: 'Tomato price alert', message: 'Tomato prices up 20% at Azadpur Mandi. Consider selling soon.', crop: 'Tomato', market: 'Azadpur Mandi', priority: 'high', actionable_info: 'Current price: ₹42.00/kg. Price increased 20% in the last 7 days.', created_at: new Date().toISOString(), read: false },
  { id: 'notif-2', type: 'threshold_crossed', title: 'Rice price threshold', message: 'Rice price dropped below ₹20/kg at Vashi Market.', crop: 'Rice', market: 'Vashi Market', priority: 'medium', actionable_info: 'Current price: ₹18.50/kg. Your threshold was ₹20.00/kg.', created_at: new Date().toISOString(), read: true },
];

describe('AlertNotifications', () => {
  it('renders empty state', () => {
    render(<AlertNotifications notifications={[]} />);
    expect(screen.getByTestId('no-notifications')).toBeInTheDocument();
  });

  // Req 12.6: Actionable information in alerts
  it('displays notifications with actionable information', () => {
    render(<AlertNotifications notifications={mockNotifications} />);
    expect(screen.getByTestId('alert-notifications')).toBeInTheDocument();
    expect(screen.getByTestId('notification-notif-1')).toBeInTheDocument();
    expect(screen.getByTestId('notif-title-notif-1')).toHaveTextContent('Tomato price alert');
    expect(screen.getByTestId('notif-message-notif-1')).toHaveTextContent('Tomato prices up 20%');
    expect(screen.getByTestId('notif-actionable-notif-1')).toHaveTextContent('Current price: ₹42.00/kg');
  });

  it('displays priority badges', () => {
    render(<AlertNotifications notifications={mockNotifications} />);
    expect(screen.getByTestId('notif-priority-notif-1')).toHaveTextContent('High');
    expect(screen.getByTestId('notif-priority-notif-2')).toHaveTextContent('Medium');
  });

  it('shows read status for read notifications', () => {
    render(<AlertNotifications notifications={mockNotifications} />);
    const notif2 = screen.getByTestId('notification-notif-2');
    expect(notif2.textContent).toContain('Read');
  });
});
