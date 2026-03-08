import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '../i18n';
import { ContentModerationPage } from './ContentModerationPage';

const renderPage = () => render(<I18nProvider><ContentModerationPage /></I18nProvider>);

const mockGetModerationQueue = jest.fn();
const mockReviewModerationItem = jest.fn();
const mockGetModerationStats = jest.fn();

jest.mock('../services/adminClient', () => ({
  getModerationQueue: (...args: any[]) => mockGetModerationQueue(...args),
  reviewModerationItem: (...args: any[]) => mockReviewModerationItem(...args),
  getModerationStats: (...args: any[]) => mockGetModerationStats(...args),
}));

const mockQueue = {
  items: [
    { id: 'mod1', article_id: 'a1', content_snapshot: 'IPM for rice involves biological control...', confidence_score: 0.85, sources: ['ICAR', 'KVK'], status: 'queued', created_at: new Date().toISOString() },
    { id: 'mod2', article_id: 'a2', content_snapshot: 'Drip irrigation reduces water usage...', confidence_score: 0.68, sources: ['Water Ministry'], status: 'queued', created_at: new Date().toISOString() },
  ],
  total: 2, limit: 50, offset: 0,
};
const mockStats = { total_queued: 12, total_approved: 85, total_rejected: 8, avg_review_time_hours: 4.2, approval_rate: 0.91 };

beforeEach(() => {
  jest.resetAllMocks();
  mockGetModerationQueue.mockResolvedValue(mockQueue);
  mockReviewModerationItem.mockResolvedValue({ ...mockQueue.items[0], status: 'approved' });
  mockGetModerationStats.mockResolvedValue(mockStats);
});

describe('ContentModerationPage', () => {
  // Req 23.2: Review interface with content, sources, confidence
  it('renders moderation queue with content, sources, and confidence', async () => {
    renderPage();
    expect(screen.getByTestId('content-moderation-page')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('moderation-queue')).toBeInTheDocument());
    expect(screen.getByTestId('mod-item-mod1')).toBeInTheDocument();
    expect(screen.getByTestId('mod-content-mod1')).toHaveTextContent('IPM for rice');
    expect(screen.getByTestId('mod-confidence-mod1')).toHaveTextContent('85%');
    expect(screen.getByTestId('mod-sources-mod1')).toHaveTextContent('ICAR, KVK');
  });

  // Req 23.2: Approve/reject buttons
  it('shows approve and reject buttons for queued items', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('approve-mod1')).toBeInTheDocument());
    expect(screen.getByTestId('reject-mod1')).toBeInTheDocument();
  });

  // Req 23.2: Approve action removes item from queue
  it('removes item from queue after approval', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByTestId('approve-mod1')).toBeInTheDocument());
    await user.click(screen.getByTestId('approve-mod1'));
    await waitFor(() => expect(screen.queryByTestId('mod-item-mod1')).not.toBeInTheDocument());
  });

  // Moderation stats display
  it('displays moderation statistics', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('moderation-stats')).toBeInTheDocument());
    expect(screen.getByTestId('moderation-stats')).toHaveTextContent('12');
    expect(screen.getByTestId('moderation-stats')).toHaveTextContent('85');
    expect(screen.getByTestId('moderation-stats')).toHaveTextContent('91%');
  });

  // Status filter
  it('has status filter dropdown', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByTestId('status-filter')).toBeInTheDocument());
    expect(screen.getByTestId('status-filter')).toHaveValue('queued');
  });

  it('handles API error gracefully', async () => {
    mockGetModerationQueue.mockRejectedValueOnce(new Error('Network error'));
    mockGetModerationStats.mockRejectedValueOnce(new Error('Network error'));
    renderPage();
    await waitFor(() => expect(screen.getByTestId('error-message')).toBeInTheDocument());
  });
});
