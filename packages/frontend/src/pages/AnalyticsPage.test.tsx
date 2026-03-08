import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '../i18n';
import { AnalyticsPage } from './AnalyticsPage';

const mockGetAnalyticsReport = jest.fn();
const mockExportReport = jest.fn();

jest.mock('../services/adminClient', () => ({
  getAnalyticsReport: (...args: any[]) => mockGetAnalyticsReport(...args),
  exportReport: (...args: any[]) => mockExportReport(...args),
}));

const mockReport = {
  period: '7d',
  daily_active_users: [
    { date: '2024-06-01', count: 210 }, { date: '2024-06-02', count: 230 },
    { date: '2024-06-03', count: 245 },
  ],
  feature_adoption: [
    { feature: 'AI Chat', rate: 85 }, { feature: 'Market Intelligence', rate: 72 },
  ],
  ai_interactions: [
    { date: '2024-06-01', queries: 450, accuracy: 88 },
    { date: '2024-06-02', queries: 520, accuracy: 91 },
  ],
  farmer_outcomes: [
    { metric: 'Avg Yield (kg/ha)', value: 3200, change_pct: 12 },
    { metric: 'Water Efficiency', value: 78, change_pct: 8 },
  ],
};

beforeEach(() => {
  jest.resetAllMocks();
  mockGetAnalyticsReport.mockResolvedValue(mockReport);
  mockExportReport.mockResolvedValue(new Blob(['test'], { type: 'text/csv' }));
  // Mock URL.createObjectURL and URL.revokeObjectURL
  global.URL.createObjectURL = jest.fn(() => 'blob:test');
  global.URL.revokeObjectURL = jest.fn();
});

describe('AnalyticsPage', () => {
  const renderPage = () => render(<I18nProvider><AnalyticsPage /></I18nProvider>);

  // Req 37.1: User engagement metrics
  it('renders analytics with daily active users', async () => {
    renderPage();
    expect(screen.getByTestId('analytics-page')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('report-content')).toBeInTheDocument());
    expect(screen.getByTestId('dau-section')).toBeInTheDocument();
  });

  // Req 37.2: AI interaction analytics
  it('displays AI interaction analytics', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('ai-interactions-section')).toBeInTheDocument());
    expect(screen.getByTestId('ai-interactions-section')).toHaveTextContent('450');
    expect(screen.getByTestId('ai-interactions-section')).toHaveTextContent('88%');
  });

  // Req 37.1: Feature adoption rates
  it('displays feature adoption rates', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('feature-adoption-section')).toBeInTheDocument());
    expect(screen.getByTestId('feature-adoption-section')).toHaveTextContent('AI Chat');
    expect(screen.getByTestId('feature-adoption-section')).toHaveTextContent('85%');
  });

  // Req 37.3: PDF/CSV export
  it('has PDF and CSV export buttons', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('export-pdf-btn')).toBeInTheDocument());
    expect(screen.getByTestId('export-csv-btn')).toBeInTheDocument();
  });

  // Farmer outcomes
  it('displays farmer outcomes with change percentages', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('farmer-outcomes-section')).toBeInTheDocument());
    expect(screen.getByTestId('farmer-outcomes-section')).toHaveTextContent('Avg Yield');
    expect(screen.getByTestId('farmer-outcomes-section')).toHaveTextContent('12%');
  });

  // Period selector
  it('has period selector', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('period-select')).toBeInTheDocument());
    expect(screen.getByTestId('period-select')).toHaveValue('7d');
  });

  it('handles API error gracefully', async () => {
    mockGetAnalyticsReport.mockRejectedValueOnce(new Error('Network error'));
    renderPage();
    await waitFor(() => expect(screen.getByTestId('error-message')).toBeInTheDocument());
  });
});
