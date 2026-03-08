import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '../i18n';
import { GroupManagementPage } from './GroupManagementPage';

const renderPage = () => render(<I18nProvider><GroupManagementPage /></I18nProvider>);

const mockListGroups = jest.fn();
const mockCreateGroup = jest.fn();
const mockGetGroupMembers = jest.fn();
const mockAddGroupMember = jest.fn();
const mockBroadcastMessage = jest.fn();
const mockGetBroadcastTracking = jest.fn();
const mockGetGroupAnalytics = jest.fn();
const mockExportGroupData = jest.fn();

jest.mock('../services/adminClient', () => ({
  listGroups: (...args: any[]) => mockListGroups(...args),
  createGroup: (...args: any[]) => mockCreateGroup(...args),
  getGroupMembers: (...args: any[]) => mockGetGroupMembers(...args),
  addGroupMember: (...args: any[]) => mockAddGroupMember(...args),
  broadcastMessage: (...args: any[]) => mockBroadcastMessage(...args),
  getBroadcastTracking: (...args: any[]) => mockGetBroadcastTracking(...args),
  getGroupAnalytics: (...args: any[]) => mockGetGroupAnalytics(...args),
  exportGroupData: (...args: any[]) => mockExportGroupData(...args),
}));

const mockGroups = {
  items: [
    { id: 'g1', name: 'Rice Farmers', description: 'Block A', member_count: 25, created_by: 'officer1', created_at: new Date().toISOString() },
    { id: 'g2', name: 'Organic Group', member_count: 15, created_by: 'officer1', created_at: new Date().toISOString() },
  ],
  total: 2, limit: 50, offset: 0,
};
const mockMembers = [
  { user_id: 'u1', name: 'Ravi Kumar', phone: '+919876543210', joined_at: new Date().toISOString() },
  { user_id: 'u2', name: 'Sita Devi', phone: '+919876543213', joined_at: new Date().toISOString() },
];
const mockGroupAnalytics = { member_count: 25, active_members: 20, messages_sent: 45, avg_view_rate: 0.78, engagement_rate: 0.65 };

beforeEach(() => {
  jest.resetAllMocks();
  mockListGroups.mockResolvedValue(mockGroups);
  mockCreateGroup.mockResolvedValue({ id: 'g-new', name: 'New Group', member_count: 0, created_by: 'user', created_at: new Date().toISOString() });
  mockGetGroupMembers.mockResolvedValue(mockMembers);
  mockAddGroupMember.mockResolvedValue({ user_id: 'u-new', name: 'New', phone: '+91999', joined_at: new Date().toISOString() });
  mockBroadcastMessage.mockResolvedValue({ id: 'b1', group_id: 'g1', content: 'Hello', sent_by: 'user', sent_at: new Date().toISOString(), delivered: 20, viewed: 0, total: 25 });
  mockGetGroupAnalytics.mockResolvedValue(mockGroupAnalytics);
  mockExportGroupData.mockResolvedValue({ csv: 'name,phone\nRavi,+91987' });
});

describe('GroupManagementPage', () => {
  // Req 24.1: Create groups
  it('renders group list and create form', async () => {
    renderPage();
    expect(screen.getByTestId('group-management-page')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('group-g1')).toBeInTheDocument());
    expect(screen.getByTestId('group-g2')).toBeInTheDocument();
    expect(screen.getByTestId('create-group-btn')).toBeInTheDocument();
  });

  // Req 24.1, 24.2: Select group shows members and broadcast
  it('shows group details with members when selected', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByTestId('group-g1')).toBeInTheDocument());
    await user.click(screen.getByTestId('group-g1'));
    await waitFor(() => expect(screen.getByTestId('group-details')).toBeInTheDocument());
    expect(screen.getByTestId('members-list')).toBeInTheDocument();
    expect(screen.getByTestId('member-u1')).toBeInTheDocument();
    expect(screen.getByTestId('send-broadcast-btn')).toBeInTheDocument();
  });

  // Req 24.4: Group analytics
  it('shows group analytics when group is selected', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByTestId('group-g1')).toBeInTheDocument());
    await user.click(screen.getByTestId('group-g1'));
    await waitFor(() => expect(screen.getByTestId('group-analytics')).toBeInTheDocument());
    expect(screen.getByTestId('group-analytics')).toHaveTextContent('25');
    expect(screen.getByTestId('group-analytics')).toHaveTextContent('78%');
  });

  // Req 24.2: Broadcast message with tracking
  it('sends broadcast and shows tracking', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByTestId('group-g1')).toBeInTheDocument());
    await user.click(screen.getByTestId('group-g1'));
    await waitFor(() => expect(screen.getByTestId('broadcast-input')).toBeInTheDocument());
    await user.type(screen.getByTestId('broadcast-input'), 'Important update');
    await user.click(screen.getByTestId('send-broadcast-btn'));
    await waitFor(() => expect(screen.getByTestId('broadcast-tracking')).toBeInTheDocument());
    expect(screen.getByTestId('broadcast-tracking')).toHaveTextContent('Delivered: 20/25');
  });

  it('handles API error gracefully', async () => {
    mockListGroups.mockRejectedValueOnce(new Error('Network error'));
    renderPage();
    await waitFor(() => expect(screen.getByTestId('error-message')).toBeInTheDocument());
  });
});
