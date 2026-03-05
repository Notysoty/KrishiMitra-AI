import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuditLogPage } from './AuditLogPage';

const mockSearchAuditLogs = jest.fn();
const mockExportAuditLogs = jest.fn();

jest.mock('../services/adminClient', () => ({
  searchAuditLogs: (...args: any[]) => mockSearchAuditLogs(...args),
  exportAuditLogs: (...args: any[]) => mockExportAuditLogs(...args),
}));

const mockLogs = {
  items: [
    { id: 'al1', timestamp: new Date().toISOString(), user_id: 'u1', user_name: 'Admin User', action: 'add_user', resource_type: 'user', resource_id: 'u2', details: 'Added user Priya', is_sensitive: false, is_suspicious: false },
    { id: 'al2', timestamp: new Date().toISOString(), user_id: 'u3', user_name: 'Unknown', action: 'failed_login', resource_type: 'auth', resource_id: 'u3', details: 'Multiple failed logins', is_sensitive: true, is_suspicious: true },
  ],
  total: 2, limit: 50, offset: 0,
};

beforeEach(() => {
  jest.resetAllMocks();
  mockSearchAuditLogs.mockResolvedValue(mockLogs);
  mockExportAuditLogs.mockResolvedValue('timestamp,user,action\n...');
});

describe('AuditLogPage', () => {
  // Req 28.5: Audit log search and filtering
  it('renders audit log table with entries', async () => {
    render(<AuditLogPage />);
    expect(screen.getByTestId('audit-log-page')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('audit-table')).toBeInTheDocument());
    expect(screen.getByTestId('log-row-al1')).toBeInTheDocument();
    expect(screen.getByTestId('log-row-al2')).toBeInTheDocument();
  });

  // Req 28.5: Search filters
  it('has search and filter controls', async () => {
    render(<AuditLogPage />);
    await waitFor(() => expect(screen.getByTestId('audit-filters')).toBeInTheDocument());
    expect(screen.getByTestId('filter-action')).toBeInTheDocument();
    expect(screen.getByTestId('filter-user-id')).toBeInTheDocument();
    expect(screen.getByTestId('filter-start-date')).toBeInTheDocument();
    expect(screen.getByTestId('filter-end-date')).toBeInTheDocument();
    expect(screen.getByTestId('filter-suspicious')).toBeInTheDocument();
    expect(screen.getByTestId('search-btn')).toBeInTheDocument();
  });

  // Req 28.5: Suspicious activity flagging
  it('highlights suspicious entries', async () => {
    render(<AuditLogPage />);
    await waitFor(() => expect(screen.getByTestId('log-row-al2')).toBeInTheDocument());
    expect(screen.getByTestId('suspicious-al2')).toBeInTheDocument();
    expect(screen.getByTestId('sensitive-al2')).toBeInTheDocument();
  });

  // Req 28.5: CSV export
  it('has export CSV button', async () => {
    render(<AuditLogPage />);
    await waitFor(() => expect(screen.getByTestId('export-csv-btn')).toBeInTheDocument());
  });

  // Log count display
  it('shows log count', async () => {
    render(<AuditLogPage />);
    await waitFor(() => expect(screen.getByTestId('log-count')).toBeInTheDocument());
    expect(screen.getByTestId('log-count')).toHaveTextContent('Showing 2 of 2');
  });

  it('handles API error gracefully', async () => {
    mockSearchAuditLogs.mockRejectedValueOnce(new Error('Network error'));
    render(<AuditLogPage />);
    await waitFor(() => expect(screen.getByTestId('error-message')).toBeInTheDocument());
  });
});
