import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '../i18n';
import { TenantAdminPage } from './TenantAdminPage';

const renderPage = () => render(<I18nProvider><TenantAdminPage /></I18nProvider>);

const mockGetBranding = jest.fn();
const mockUpdateBranding = jest.fn();
const mockListUsers = jest.fn();
const mockAddUser = jest.fn();
const mockRemoveUser = jest.fn();
const mockBulkImportUsers = jest.fn();
const mockUpdateRegionalPreferences = jest.fn();
const mockGetPendingContent = jest.fn();
const mockReviewContent = jest.fn();
const mockGetUsageAnalytics = jest.fn();

jest.mock('../services/adminClient', () => ({
  getBranding: (...args: any[]) => mockGetBranding(...args),
  updateBranding: (...args: any[]) => mockUpdateBranding(...args),
  listUsers: (...args: any[]) => mockListUsers(...args),
  addUser: (...args: any[]) => mockAddUser(...args),
  removeUser: (...args: any[]) => mockRemoveUser(...args),
  bulkImportUsers: (...args: any[]) => mockBulkImportUsers(...args),
  updateRegionalPreferences: (...args: any[]) => mockUpdateRegionalPreferences(...args),
  getPendingContent: (...args: any[]) => mockGetPendingContent(...args),
  reviewContent: (...args: any[]) => mockReviewContent(...args),
  getUsageAnalytics: (...args: any[]) => mockGetUsageAnalytics(...args),
}));

const mockBranding = { logo_url: '/logo.png', primary_color: '#2e7d32', secondary_color: '#66bb6a', org_name: 'AgriCoop' };
const mockUsers = {
  items: [
    { id: 'u1', phone: '+919876543210', name: 'Ravi Kumar', roles: ['Farmer'], created_at: new Date().toISOString() },
    { id: 'u2', phone: '+919876543211', name: 'Priya Sharma', roles: ['Field_Officer'], created_at: new Date().toISOString() },
  ],
  total: 2, limit: 50, offset: 0,
};
const mockRegional = { supported_languages: ['hi', 'en'], supported_crops: ['Rice', 'Wheat'], supported_markets: ['Azadpur Mandi'], default_region: 'North India' };
const mockPending = {
  items: [
    { id: 'pc1', article_id: 'a1', title: 'Rice Pest Management', content_snapshot: 'IPM for rice...', confidence_score: 0.85, sources: ['ICAR'], status: 'queued', created_at: new Date().toISOString() },
  ],
  total: 1, limit: 50, offset: 0,
};
const mockAnalytics = { active_users: 245, total_users: 500, ai_interactions: 3200, feature_adoption: { chat: 85, market: 72 }, daily_active_users: [210, 230], period: 'Last 7 days' };

beforeEach(() => {
  jest.resetAllMocks();
  mockGetBranding.mockResolvedValue(mockBranding);
  mockUpdateBranding.mockResolvedValue(mockBranding);
  mockListUsers.mockResolvedValue(mockUsers);
  mockAddUser.mockResolvedValue({ id: 'u-new', phone: '+91999', name: 'New', roles: ['Farmer'], created_at: new Date().toISOString() });
  mockRemoveUser.mockResolvedValue({ success: true });
  mockBulkImportUsers.mockResolvedValue({ imported: 2, failed: 0, errors: [] });
  mockUpdateRegionalPreferences.mockResolvedValue(mockRegional);
  mockGetPendingContent.mockResolvedValue(mockPending);
  mockReviewContent.mockResolvedValue({ ...mockPending.items[0], status: 'approved' });
  mockGetUsageAnalytics.mockResolvedValue(mockAnalytics);
});

describe('TenantAdminPage', () => {
  // Req 21.1: Branding configuration
  it('renders branding tab with config form', async () => {
    renderPage();
    expect(screen.getByTestId('tenant-admin-page')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('branding-section')).toBeInTheDocument());
    expect(screen.getByTestId('branding-org-name')).toHaveValue('AgriCoop');
    expect(screen.getByTestId('save-branding-btn')).toBeInTheDocument();
  });

  // Req 21.2: User management
  it('displays user management with add/remove', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByTestId('branding-section')).toBeInTheDocument());
    await user.click(screen.getByTestId('tab-users'));
    await waitFor(() => expect(screen.getByTestId('users-section')).toBeInTheDocument());
    expect(screen.getByTestId('users-table')).toBeInTheDocument();
    expect(screen.getByTestId('user-row-u1')).toBeInTheDocument();
    expect(screen.getByTestId('add-user-btn')).toBeInTheDocument();
  });

  // Req 21.7: Bulk CSV import
  it('shows bulk import section on users tab', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByTestId('branding-section')).toBeInTheDocument());
    await user.click(screen.getByTestId('tab-users'));
    await waitFor(() => expect(screen.getByTestId('csv-file-input')).toBeInTheDocument());
    expect(screen.getByTestId('bulk-import-btn')).toBeInTheDocument();
  });

  // Req 21.6: Usage analytics
  it('displays usage analytics with stats', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByTestId('branding-section')).toBeInTheDocument());
    await user.click(screen.getByTestId('tab-analytics'));
    await waitFor(() => expect(screen.getByTestId('analytics-section')).toBeInTheDocument());
    expect(screen.getByTestId('stat-active-users')).toHaveTextContent('245');
    expect(screen.getByTestId('stat-total-users')).toHaveTextContent('500');
    expect(screen.getByTestId('stat-ai-interactions')).toHaveTextContent('3200');
  });

  // Req 21.1: Content approval
  it('displays content approval with approve/reject', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByTestId('branding-section')).toBeInTheDocument());
    // Use getAllByTestId since 'tab-content' also exists as a wrapper div
    const contentTab = screen.getByRole('button', { name: 'Content' });
    await user.click(contentTab);
    await waitFor(() => expect(screen.getByTestId('content-section')).toBeInTheDocument());
    expect(screen.getByTestId('content-item-pc1')).toBeInTheDocument();
    expect(screen.getByTestId('approve-pc1')).toBeInTheDocument();
    expect(screen.getByTestId('reject-pc1')).toBeInTheDocument();
  });

  it('handles API error gracefully', async () => {
    mockGetBranding.mockRejectedValueOnce(new Error('Network error'));
    renderPage();
    await waitFor(() => expect(screen.getByTestId('error-message')).toBeInTheDocument());
    expect(screen.getByTestId('error-message')).toHaveTextContent('Failed to load data');
  });
});
