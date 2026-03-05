import React, { useState, useEffect, useCallback } from 'react';
import {
  getModerationQueue, reviewModerationItem, getModerationStats,
  ModerationItem, ModerationStats,
} from '../services/adminClient';

export const ContentModerationPage: React.FC = () => {
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

  const containerStyle: React.CSSProperties = { maxWidth: 800, margin: '0 auto', fontFamily: 'sans-serif' };
  const headerStyle: React.CSSProperties = { padding: '12px 16px', backgroundColor: '#e65100', color: '#fff', fontWeight: 600, fontSize: 18 };
  const btnStyle: React.CSSProperties = { padding: '6px 16px', backgroundColor: '#2e7d32', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13 };
  const rejectBtnStyle: React.CSSProperties = { ...btnStyle, backgroundColor: '#c62828', marginLeft: 8 };
  const selectStyle: React.CSSProperties = { padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4, fontSize: 14, marginBottom: 16 };

  const confidenceColor = (score: number) => score >= 0.8 ? '#2e7d32' : score >= 0.6 ? '#f9a825' : '#c62828';

  return (
    <div style={containerStyle} data-testid="content-moderation-page">
      <div style={headerStyle}>Content Moderation</div>

      {stats && (
        <div data-testid="moderation-stats" style={{ display: 'flex', gap: 12, padding: 16 }}>
          <div style={{ flex: 1, padding: 8, backgroundColor: '#fff3e0', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{stats.total_queued}</div>
            <div style={{ fontSize: 11, color: '#666' }}>Queued</div>
          </div>
          <div style={{ flex: 1, padding: 8, backgroundColor: '#e8f5e9', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{stats.total_approved}</div>
            <div style={{ fontSize: 11, color: '#666' }}>Approved</div>
          </div>
          <div style={{ flex: 1, padding: 8, backgroundColor: '#ffebee', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{stats.total_rejected}</div>
            <div style={{ fontSize: 11, color: '#666' }}>Rejected</div>
          </div>
          <div style={{ flex: 1, padding: 8, backgroundColor: '#e3f2fd', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{(stats.approval_rate * 100).toFixed(0)}%</div>
            <div style={{ fontSize: 11, color: '#666' }}>Approval Rate</div>
          </div>
        </div>
      )}

      <div style={{ padding: '0 16px' }}>
        <label>Filter: </label>
        <select style={selectStyle} value={statusFilter} onChange={e => setStatusFilter(e.target.value)} data-testid="status-filter">
          <option value="queued">Queued</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {loading && <div data-testid="loading-indicator" style={{ padding: 24, textAlign: 'center', color: '#666' }}>Loading...</div>}
      {error && <div data-testid="error-message" role="alert" style={{ padding: '8px 16px', backgroundColor: '#ffebee', color: '#c62828', fontSize: 13 }}>{error}</div>}

      {!loading && !error && (
        <div style={{ padding: 16 }} data-testid="moderation-queue">
          {queue.length === 0 && <div data-testid="empty-queue">No items to review.</div>}
          {queue.map(item => (
            <div key={item.id} data-testid={`mod-item-${item.id}`} style={{ padding: 12, marginBottom: 12, backgroundColor: '#fafafa', borderRadius: 8, border: '1px solid #e0e0e0' }}>
              <div style={{ fontSize: 14, lineHeight: 1.5, marginBottom: 8 }} data-testid={`mod-content-${item.id}`}>{item.content_snapshot}</div>
              <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#666', marginBottom: 8 }}>
                <span data-testid={`mod-confidence-${item.id}`} style={{ color: confidenceColor(item.confidence_score), fontWeight: 600 }}>
                  Confidence: {(item.confidence_score * 100).toFixed(0)}%
                </span>
                <span data-testid={`mod-sources-${item.id}`}>Sources: {item.sources.join(', ') || 'None'}</span>
              </div>
              {item.status === 'queued' && (
                <div>
                  <button style={btnStyle} onClick={() => handleReview(item.id, 'approve')} data-testid={`approve-${item.id}`}>Approve</button>
                  <button style={rejectBtnStyle} onClick={() => handleReview(item.id, 'reject')} data-testid={`reject-${item.id}`}>Reject</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
