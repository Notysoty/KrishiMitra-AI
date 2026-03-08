import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '../i18n';
import { PlatformAdminPage } from './PlatformAdminPage';

const renderPage = () => render(<I18nProvider><PlatformAdminPage /></I18nProvider>);

const mockGetTenantDashboard = jest.fn();
const mockCreateTenant = jest.fn();
const mockSuspendTenant = jest.fn();
const mockGetGlobalAIConfig = jest.fn();
const mockUpdateGlobalAIConfig = jest.fn();
const mockGetCrossTenantAnalytics = jest.fn();
const mockGetFeatureFlags = jest.fn();
const mockUpdateFeatureFlags = jest.fn();
const mockScheduleMaintenance = jest.fn();
const mockGetMaintenanceWindows = jest.fn();

jest.mock('../services/adminClient', () => ({
  getTenantDashboard: (...args: any[]) => mockGetTenantDashboard(...args),
  createTenant: (...args: any[]) => mockCreateTenant(...args),
  suspendTenant: (...args: any[]) => mockSuspendTenant(...args),
  getGlobalAIConfig: (...args: any[]) => mockGetGlobalAIConfig(...args),
  updateGlobalAIConfig: (...args: any[]) => mockUpdateGlobalAIConfig(...args),
  getCrossTenantAnalytics: (...args: any[]) => mockGetCrossTenantAnalytics(...args),
  getFeatureFlags: (...args: any[]) => mockGetFeatureFlags(...args),
  updateFeatureFlags: (...args: any[]) => mockUpdateFeatureFlags(...args),
  scheduleMaintenance: (...args: any[]) => mockScheduleMaintenance(...args),
  getMaintenanceWindows: (...args: any[]) => mockGetMaintenanceWindows(...args),
}));

const mockTenants = [
  { id: 't1', name: 'AgriCoop', type: 'FPO', status: 'active', user_count: 500, resource_usage: { storage_mb: 1200, ai_queries: 15000 }, created_at: '2024-01-15T00:00:00Z' },
  { id: 't2', name: 'FarmHelp', type: 'NGO', status: 'suspended', user_count: 300, resource_usage: { storage_mb: 800, ai_queries: 8000 }, created_at: '2024-03-01T00:00:00Z' },
];
const mockAIConfig = { primary_model: 'gpt-4', fallback_model: 'gpt-3.5-turbo', safety_level: 'strict', max_tokens: 2048, temperature: 0.7 };
const mockCrossAnalytics = {
  total_tenants: 3, total_users: 950, total_ai_queries: 26000, avg_response_time_ms: 1200,
  tenants_by_type: { FPO: 1, NGO: 1 }, queries_by_day: [{ date: '2024-06-01', count: 850 }],
};
const mockFlags = { voice_input: true, disease_classification: true, sustainability_dashboard: false };
const mockMaintWindows = [{ id: 'mw1', title: 'DB Upgrade', description: 'Upgrading PG', scheduled_start: '2024-07-15T02:00:00Z', scheduled_end: '2024-07-15T06:00:00Z', created_at: '2024-07-01T00:00:00Z' }];

beforeEach(() => {
  jest.resetAllMocks();
  mockGetTenantDashboard.mockResolvedValue(mockTenants);
  mockCreateTenant.mockResolvedValue({ id: 't-new', name: 'New', type: 'FPO', status: 'active', user_count: 1, resource_usage: { storage_mb: 0, ai_queries: 0 }, created_at: new Date().toISOString() });
  mockSuspendTenant.mockResolvedValue({ ...mockTenants[0], status: 'suspended' });
  mockGetGlobalAIConfig.mockResolvedValue(mockAIConfig);
  mockUpdateGlobalAIConfig.mockResolvedValue(mockAIConfig);
  mockGetCrossTenantAnalytics.mockResolvedValue(mockCrossAnalytics);
  mockGetFeatureFlags.mockResolvedValue(mockFlags);
  mockUpdateFeatureFlags.mockResolvedValue({ ...mockFlags, sustainability_dashboard: true });
  mockScheduleMaintenance.mockResolvedValue({ id: 'mw-new', title: 'Test', description: 'Test', scheduled_start: '', scheduled_end: '', created_at: new Date().toISOString() });
  mockGetMaintenanceWindows.mockResolvedValue(mockMaintWindows);
});

describe('PlatformAdminPage', () => {
  // Req 22.1: Tenant management
  it('renders tenant management dashboard', async () => {
    renderPage();
    expect(screen.getByTestId('platform-admin-page')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('tenants-section')).toBeInTheDocument());
    expect(screen.getByTestId('tenants-table')).toBeInTheDocument();
    expect(screen.getByTestId('tenant-row-t1')).toBeInTheDocument();
    expect(screen.getByTestId('create-tenant-btn')).toBeInTheDocument();
  });

  // Req 22.2: Tenant status display
  it('shows tenant status and suspend button for active tenants', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('tenant-row-t1')).toBeInTheDocument());
    expect(screen.getByTestId('suspend-t1')).toBeInTheDocument();
    // Suspended tenant should not have suspend button
    expect(screen.queryByTestId('suspend-t2')).not.toBeInTheDocument();
  });

  // Req 22.4: Global AI config
  it('displays AI configuration form', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByTestId('tenants-section')).toBeInTheDocument());
    await user.click(screen.getByTestId('tab-config'));
    await waitFor(() => expect(screen.getByTestId('config-section')).toBeInTheDocument());
    expect(screen.getByTestId('ai-primary-model')).toHaveValue('gpt-4');
    expect(screen.getByTestId('ai-safety-level')).toHaveValue('strict');
    expect(screen.getByTestId('save-ai-config-btn')).toBeInTheDocument();
  });

  // Req 22.2: Cross-tenant analytics
  it('displays cross-tenant analytics', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByTestId('tenants-section')).toBeInTheDocument());
    await user.click(screen.getByTestId('tab-analytics'));
    await waitFor(() => expect(screen.getByTestId('cross-analytics-section')).toBeInTheDocument());
    expect(screen.getByTestId('stat-total-tenants')).toHaveTextContent('3');
    expect(screen.getByTestId('stat-total-users')).toHaveTextContent('950');
    expect(screen.getByTestId('stat-total-queries')).toHaveTextContent('26000');
  });

  // Req 22.8: Feature flags
  it('displays feature flags with toggle', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByTestId('tenants-section')).toBeInTheDocument());
    await user.click(screen.getByTestId('tab-flags'));
    await waitFor(() => expect(screen.getByTestId('flag-voice_input')).toBeInTheDocument());
    expect(screen.getByTestId('toggle-voice_input')).toHaveAttribute('aria-label', 'Enabled');
    expect(screen.getByTestId('toggle-sustainability_dashboard')).toHaveAttribute('aria-label', 'Disabled');
  });

  // Req 22.8: Maintenance scheduling
  it('displays maintenance scheduling', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByTestId('tenants-section')).toBeInTheDocument());
    await user.click(screen.getByTestId('tab-maintenance'));
    await waitFor(() => expect(screen.getByTestId('maintenance-section')).toBeInTheDocument());
    expect(screen.getByTestId('maint-mw1')).toBeInTheDocument();
    expect(screen.getByTestId('schedule-maint-btn')).toBeInTheDocument();
  });

  it('handles API error gracefully', async () => {
    mockGetTenantDashboard.mockRejectedValueOnce(new Error('Network error'));
    renderPage();
    await waitFor(() => expect(screen.getByTestId('error-message')).toBeInTheDocument());
  });
});
