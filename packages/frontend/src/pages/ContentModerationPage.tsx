import React, { useState, useEffect, useCallback } from 'react';
import {
  getModerationQueue, reviewModerationItem, getModerationStats,
  ModerationItem, ModerationStats,
} from '../services/adminClient';
import { useTranslation } from '../i18n';

export const ContentModerationPage: React.FC = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queue, setQueue] = useState<ModerationItem[]>([]);
  const [stats, setStats] = useState<ModerationStats | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('queued');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [queueData, statsData] = await Promise.all([
        getModerationQueue(statusFilter),
        getModerationStats(),
      ]);
      setQueue(queueData.items);
      setStats(statsData);
    } catch { setError('Failed to load moderation data.'); }
    finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleReview = async (itemId: string, action: 'approve' | 'reject') => {
    setLoading(true);
    try {
      await reviewModerationItem(itemId, action);
      setQueue(prev => prev.filter(i => i.id !== itemId));
    } catch { setError('Failed to review item.'); }
    finally { setLoading(false); }
  };

  const confidenceBadge = (score: number) => score >= 0.8 ? 'badge badge-green' : score >= 0.6 ? 'badge badge-yellow' : 'badge badge-red';

  return (
    <div className="page-container fade-in" data-testid="content-moderation-page">
      <div className="section-header-light">🛡️ {t('contentModeration')}</div>

      {stats && (
        <div className="stat-grid mt-4" data-testid="moderation-stats">
          <div className="stat-card" style={{ background: 'var(--warning-light)' }}>
            <div className="stat-value">{stats.total_queued}</div>
            <div className="stat-label">Queued</div>
          </div>
          <div className="stat-card" style={{ background: 'var(--success-light)' }}>
            <div className="stat-value">{stats.total_approved}</div>
            <div className="stat-label">Approved</div>
          </div>
          <div className="stat-card" style={{ background: 'var(--danger-light)' }}>
            <div className="stat-value">{stats.total_rejected}</div>
            <div className="stat-label">Rejected</div>
          </div>
          <div className="stat-card" style={{ background: 'var(--accent-light)' }}>
            <div className="stat-value">{(stats.approval_rate * 100).toFixed(0)}%</div>
            <div className="stat-label">Approval Rate</div>
          </div>
        </div>
      )}

      <div className="form-group mt-4">
        <label className="form-label">Filter</label>
        <select className="form-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} data-testid="status-filter" style={{ width: 'auto' }}>
          <option value="queued">Queued</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {loading && <div data-testid="loading-indicator" className="p-4"><div className="skeleton-heading mb-3" /><div className="skeleton-line" /><div className="skeleton-line medium" /><div className="skeleton-line short" /></div>}
      {error && <div data-testid="error-message" role="alert" className="alert-box alert-error">{error}</div>}

      {!loading && !error && (
        <div className="mt-3" data-testid="moderation-queue">
          {queue.length === 0 && <div data-testid="empty-queue" className="empty-state"><div className="empty-icon">📭</div><div className="empty-text">No items to review.</div></div>}
          {queue.map(item => (
            <div key={item.id} data-testid={`mod-item-${item.id}`} className="card mb-3">
              <div className="card-body">
                <div className="text-sm" style={{ lineHeight: 1.5 }} data-testid={`mod-content-${item.id}`}>{item.content_snapshot}</div>
                <div className="flex gap-3 mt-2 text-xs text-muted">
                  <span data-testid={`mod-confidence-${item.id}`} className={confidenceBadge(item.confidence_score)}>
                    Confidence: {(item.confidence_score * 100).toFixed(0)}%
                  </span>
                  <span data-testid={`mod-sources-${item.id}`}>Sources: {item.sources.join(', ') || 'None'}</span>
                </div>
                {item.status === 'queued' && (
                  <div className="flex gap-2 mt-3">
                    <button className="btn btn-primary btn-sm" onClick={() => handleReview(item.id, 'approve')} data-testid={`approve-${item.id}`}>Approve</button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleReview(item.id, 'reject')} data-testid={`reject-${item.id}`}>Reject</button>
                  </div>
                )}
              </div>
            </div>
          ))}
          <div className="mobile-card-list" data-testid="moderation-mobile-cards">
            {queue.map(item => (
              <div key={item.id} className="mobile-card-item" data-testid={`mod-card-${item.id}`}>
                <div className="mobile-card-row">
                  <span className="mobile-card-label">Content</span>
                  <span className="mobile-card-value">{item.content_snapshot}</span>
                </div>
                <div className="mobile-card-row">
                  <span className="mobile-card-label">Confidence</span>
                  <span className="mobile-card-value">
                    <span className={confidenceBadge(item.confidence_score)}>{(item.confidence_score * 100).toFixed(0)}%</span>
                  </span>
                </div>
                <div className="mobile-card-row">
                  <span className="mobile-card-label">Sources</span>
                  <span className="mobile-card-value">{item.sources.join(', ') || 'None'}</span>
                </div>
                <div className="mobile-card-row">
                  <span className="mobile-card-label">Status</span>
                  <span className="mobile-card-value">{item.status}</span>
                </div>
                {item.status === 'queued' && (
                  <div className="flex gap-2 mt-2">
                    <button className="btn btn-primary btn-sm" onClick={() => handleReview(item.id, 'approve')}>Approve</button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleReview(item.id, 'reject')}>Reject</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
