import React, { useState, useEffect, useCallback } from 'react';
import { searchAuditLogs, exportAuditLogs, AuditLogEntry, AuditFilter } from '../services/adminClient';
import { useTranslation } from '../i18n';

export const AuditLogPage: React.FC = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<AuditFilter>({ limit: 50, offset: 0 });

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await searchAuditLogs(filter);
      setLogs(result.items);
      setTotal(result.total);
    } catch { setError('Failed to load audit logs.'); }
    finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  const handleExport = async () => {
    try {
      const csv = await exportAuditLogs(filter);
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'audit_logs.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch { setError('Failed to export audit logs.'); }
  };

  return (
    <div className="page-container fade-in" data-testid="audit-log-page">
      <div className="section-header-light">📋 {t('auditLogViewer')}</div>

      <div className="mt-4">
        <div className="filter-bar" data-testid="audit-filters">
          <input className="filter-input" placeholder="Action type" value={filter.action || ''} onChange={e => setFilter(f => ({ ...f, action: e.target.value || undefined }))} data-testid="filter-action" />
          <input className="filter-input" placeholder="User ID" value={filter.userId || ''} onChange={e => setFilter(f => ({ ...f, userId: e.target.value || undefined }))} data-testid="filter-user-id" />
          <input className="filter-input" placeholder="Resource type" value={filter.resourceType || ''} onChange={e => setFilter(f => ({ ...f, resourceType: e.target.value || undefined }))} data-testid="filter-resource-type" />
          <input className="filter-input" type="date" value={filter.startDate || ''} onChange={e => setFilter(f => ({ ...f, startDate: e.target.value || undefined }))} data-testid="filter-start-date" />
          <input className="filter-input" type="date" value={filter.endDate || ''} onChange={e => setFilter(f => ({ ...f, endDate: e.target.value || undefined }))} data-testid="filter-end-date" />
          <label className="text-sm flex items-center gap-1">
            <input type="checkbox" checked={filter.suspicious || false} onChange={e => setFilter(f => ({ ...f, suspicious: e.target.checked || undefined }))} data-testid="filter-suspicious" />
            Suspicious only
          </label>
          <button className="btn btn-primary btn-sm" onClick={loadLogs} data-testid="search-btn">Search</button>
          <button className="btn btn-accent btn-sm" onClick={handleExport} data-testid="export-csv-btn">Export CSV</button>
        </div>

        {loading && <div data-testid="loading-indicator" className="p-4"><div className="skeleton-heading mb-3" /><div className="skeleton-line" /><div className="skeleton-line medium" /><div className="skeleton-line short" /></div>}
        {error && <div data-testid="error-message" role="alert" className="alert-box alert-error">{error}</div>}

        {!loading && !error && (
          <div>
            <div className="text-sm text-muted mb-2" data-testid="log-count">Showing {logs.length} of {total} entries</div>
            <div className="card">
              <table className="data-table" data-testid="audit-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>User</th>
                    <th>Action</th>
                    <th>Resource</th>
                    <th>Details</th>
                    <th>Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => (
                    <tr key={log.id} data-testid={`log-row-${log.id}`} style={log.is_suspicious ? { background: 'var(--warning-light)' } : undefined}>
                      <td>{new Date(log.timestamp).toLocaleString()}</td>
                      <td>{log.user_name}</td>
                      <td>{log.action}</td>
                      <td>{log.resource_type}/{log.resource_id}</td>
                      <td>{log.details}</td>
                      <td>
                        {log.is_sensitive && <span data-testid={`sensitive-${log.id}`} style={{ marginRight: 4 }}>🔒</span>}
                        {log.is_suspicious && <span data-testid={`suspicious-${log.id}`}>⚠️</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mobile-card-list" data-testid="audit-mobile-cards">
                {logs.map(log => (
                  <div key={log.id} className="mobile-card-item" data-testid={`log-card-${log.id}`} style={log.is_suspicious ? { background: 'var(--warning-light)' } : undefined}>
                    <div className="mobile-card-row">
                      <span className="mobile-card-label">Timestamp</span>
                      <span className="mobile-card-value">{new Date(log.timestamp).toLocaleString()}</span>
                    </div>
                    <div className="mobile-card-row">
                      <span className="mobile-card-label">User</span>
                      <span className="mobile-card-value">{log.user_name}</span>
                    </div>
                    <div className="mobile-card-row">
                      <span className="mobile-card-label">Action</span>
                      <span className="mobile-card-value">{log.action}</span>
                    </div>
                    <div className="mobile-card-row">
                      <span className="mobile-card-label">Resource</span>
                      <span className="mobile-card-value">{log.resource_type}/{log.resource_id}</span>
                    </div>
                    <div className="mobile-card-row">
                      <span className="mobile-card-label">Details</span>
                      <span className="mobile-card-value">{log.details}</span>
                    </div>
                    <div className="mobile-card-row">
                      <span className="mobile-card-label">Flags</span>
                      <span className="mobile-card-value">
                        {log.is_sensitive && <span style={{ marginRight: 4 }}>🔒</span>}
                        {log.is_suspicious && <span>⚠️</span>}
                        {!log.is_sensitive && !log.is_suspicious && '—'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
