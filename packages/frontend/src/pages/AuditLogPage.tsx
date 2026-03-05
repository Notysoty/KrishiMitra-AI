import React, { useState, useEffect, useCallback } from 'react';
import { searchAuditLogs, exportAuditLogs, AuditLogEntry, AuditFilter } from '../services/adminClient';

export const AuditLogPage: React.FC = () => {
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

  const containerStyle: React.CSSProperties = { maxWidth: 900, margin: '0 auto', fontFamily: 'sans-serif' };
  const headerStyle: React.CSSProperties = { padding: '12px 16px', backgroundColor: '#37474f', color: '#fff', fontWeight: 600, fontSize: 18 };
  const inputStyle: React.CSSProperties = { padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4, fontSize: 13, marginRight: 8, marginBottom: 8 };
  const btnStyle: React.CSSProperties = { padding: '6px 16px', backgroundColor: '#37474f', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13 };

  return (
    <div style={containerStyle} data-testid="audit-log-page">
      <div style={headerStyle}>Audit Log Viewer</div>

      <div style={{ padding: 16 }}>
        <div data-testid="audit-filters" style={{ marginBottom: 16, padding: 12, backgroundColor: '#f5f5f5', borderRadius: 8 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Search & Filter</div>
          <input style={inputStyle} placeholder="Action type" value={filter.action || ''} onChange={e => setFilter(f => ({ ...f, action: e.target.value || undefined }))} data-testid="filter-action" />
          <input style={inputStyle} placeholder="User ID" value={filter.userId || ''} onChange={e => setFilter(f => ({ ...f, userId: e.target.value || undefined }))} data-testid="filter-user-id" />
          <input style={inputStyle} placeholder="Resource type" value={filter.resourceType || ''} onChange={e => setFilter(f => ({ ...f, resourceType: e.target.value || undefined }))} data-testid="filter-resource-type" />
          <input style={inputStyle} type="date" value={filter.startDate || ''} onChange={e => setFilter(f => ({ ...f, startDate: e.target.value || undefined }))} data-testid="filter-start-date" />
          <input style={inputStyle} type="date" value={filter.endDate || ''} onChange={e => setFilter(f => ({ ...f, endDate: e.target.value || undefined }))} data-testid="filter-end-date" />
          <label style={{ fontSize: 13, marginRight: 12 }}>
            <input type="checkbox" checked={filter.suspicious || false} onChange={e => setFilter(f => ({ ...f, suspicious: e.target.checked || undefined }))} data-testid="filter-suspicious" />
            {' '}Suspicious only
          </label>
          <button style={btnStyle} onClick={loadLogs} data-testid="search-btn">Search</button>
          <button style={{ ...btnStyle, marginLeft: 8, backgroundColor: '#1565c0' }} onClick={handleExport} data-testid="export-csv-btn">Export CSV</button>
        </div>

        {loading && <div data-testid="loading-indicator" style={{ padding: 24, textAlign: 'center', color: '#666' }}>Loading...</div>}
        {error && <div data-testid="error-message" role="alert" style={{ padding: '8px 16px', backgroundColor: '#ffebee', color: '#c62828', fontSize: 13 }}>{error}</div>}

        {!loading && !error && (
          <div>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 8 }} data-testid="log-count">Showing {logs.length} of {total} entries</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }} data-testid="audit-table">
              <thead>
                <tr style={{ borderBottom: '2px solid #e0e0e0', textAlign: 'left' }}>
                  <th style={{ padding: 8 }}>Timestamp</th>
                  <th style={{ padding: 8 }}>User</th>
                  <th style={{ padding: 8 }}>Action</th>
                  <th style={{ padding: 8 }}>Resource</th>
                  <th style={{ padding: 8 }}>Details</th>
                  <th style={{ padding: 8 }}>Flags</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id} data-testid={`log-row-${log.id}`} style={{ borderBottom: '1px solid #eee', backgroundColor: log.is_suspicious ? '#fff3e0' : 'transparent' }}>
                    <td style={{ padding: 8 }}>{new Date(log.timestamp).toLocaleString()}</td>
                    <td style={{ padding: 8 }}>{log.user_name}</td>
                    <td style={{ padding: 8 }}>{log.action}</td>
                    <td style={{ padding: 8 }}>{log.resource_type}/{log.resource_id}</td>
                    <td style={{ padding: 8 }}>{log.details}</td>
                    <td style={{ padding: 8 }}>
                      {log.is_sensitive && <span data-testid={`sensitive-${log.id}`} style={{ color: '#e65100', marginRight: 4 }}>🔒</span>}
                      {log.is_suspicious && <span data-testid={`suspicious-${log.id}`} style={{ color: '#c62828' }}>⚠️</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
