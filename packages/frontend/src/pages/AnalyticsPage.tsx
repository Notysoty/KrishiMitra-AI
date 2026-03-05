import React, { useState, useEffect, useCallback } from 'react';
import { getAnalyticsReport, exportReport, AnalyticsReport } from '../services/adminClient';

export const AnalyticsPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<AnalyticsReport | null>(null);
  const [period, setPeriod] = useState('7d');

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setReport(await getAnalyticsReport(period));
    } catch { setError('Failed to load analytics.'); }
    finally { setLoading(false); }
  }, [period]);

  useEffect(() => { loadReport(); }, [loadReport]);

  const handleExport = async (format: 'pdf' | 'csv') => {
    try {
      const blob = await exportReport(format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `analytics-report.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { setError(`Failed to export ${format.toUpperCase()}.`); }
  };

  const containerStyle: React.CSSProperties = { maxWidth: 800, margin: '0 auto', fontFamily: 'sans-serif' };
  const headerStyle: React.CSSProperties = { padding: '12px 16px', backgroundColor: '#0d47a1', color: '#fff', fontWeight: 600, fontSize: 18 };
  const selectStyle: React.CSSProperties = { padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4, fontSize: 14, marginRight: 8 };
  const btnStyle: React.CSSProperties = { padding: '6px 16px', backgroundColor: '#0d47a1', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13, marginRight: 8 };

  return (
    <div style={containerStyle} data-testid="analytics-page">
      <div style={headerStyle}>Analytics & Reporting</div>

      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
          <label style={{ marginRight: 8 }}>Period:</label>
          <select style={selectStyle} value={period} onChange={e => setPeriod(e.target.value)} data-testid="period-select">
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 90 Days</option>
          </select>
          <button style={btnStyle} onClick={() => handleExport('pdf')} data-testid="export-pdf-btn">Export PDF</button>
          <button style={btnStyle} onClick={() => handleExport('csv')} data-testid="export-csv-btn">Export CSV</button>
        </div>

        {loading && <div data-testid="loading-indicator" style={{ padding: 24, textAlign: 'center', color: '#666' }}>Loading...</div>}
        {error && <div data-testid="error-message" role="alert" style={{ padding: '8px 16px', backgroundColor: '#ffebee', color: '#c62828', fontSize: 13 }}>{error}</div>}

        {!loading && !error && report && (
          <div data-testid="report-content">
            <div data-testid="dau-section" style={{ marginBottom: 24 }}>
              <h3>Daily Active Users</h3>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 120 }}>
                {report.daily_active_users.map((d, i) => {
                  const maxCount = Math.max(...report.daily_active_users.map(x => x.count));
                  const height = maxCount > 0 ? (d.count / maxCount) * 100 : 0;
                  return (
                    <div key={i} style={{ flex: 1, textAlign: 'center' }}>
                      <div style={{ height: `${height}%`, backgroundColor: '#0d47a1', borderRadius: '4px 4px 0 0', minHeight: 4 }} />
                      <div style={{ fontSize: 10, color: '#666', marginTop: 4 }}>{d.date.slice(5)}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div data-testid="feature-adoption-section" style={{ marginBottom: 24 }}>
              <h3>Feature Adoption</h3>
              {report.feature_adoption.map(f => (
                <div key={f.feature} style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span>{f.feature}</span><span>{f.rate}%</span>
                  </div>
                  <div style={{ height: 8, backgroundColor: '#e0e0e0', borderRadius: 4 }}>
                    <div style={{ height: '100%', width: `${f.rate}%`, backgroundColor: '#0d47a1', borderRadius: 4 }} />
                  </div>
                </div>
              ))}
            </div>

            <div data-testid="ai-interactions-section" style={{ marginBottom: 24 }}>
              <h3>AI Interactions</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e0e0e0', textAlign: 'left' }}>
                    <th style={{ padding: 8 }}>Date</th><th style={{ padding: 8 }}>Queries</th><th style={{ padding: 8 }}>Accuracy</th>
                  </tr>
                </thead>
                <tbody>
                  {report.ai_interactions.map(ai => (
                    <tr key={ai.date} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: 8 }}>{ai.date}</td>
                      <td style={{ padding: 8 }}>{ai.queries}</td>
                      <td style={{ padding: 8 }}>{ai.accuracy}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div data-testid="farmer-outcomes-section">
              <h3>Farmer Outcomes</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                {report.farmer_outcomes.map(o => (
                  <div key={o.metric} style={{ padding: 12, backgroundColor: '#e3f2fd', borderRadius: 8, textAlign: 'center' }}>
                    <div style={{ fontSize: 20, fontWeight: 700 }}>{o.value.toLocaleString('en-IN')}</div>
                    <div style={{ fontSize: 12, color: '#666' }}>{o.metric}</div>
                    <div style={{ fontSize: 12, color: o.change_pct >= 0 ? '#2e7d32' : '#c62828', fontWeight: 600 }}>
                      {o.change_pct >= 0 ? '↑' : '↓'} {Math.abs(o.change_pct)}%
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
