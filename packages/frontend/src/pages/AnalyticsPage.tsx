import React, { useState, useEffect, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
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

  return (
    <div className="page-container fade-in" data-testid="analytics-page">
      <div className="section-header-light">📊 Analytics & Reporting</div>

      <div className="mt-4">
        <div className="flex items-center gap-2 mb-4">
          <label className="form-label" style={{ marginBottom: 0 }}>Period:</label>
          <select className="form-select" value={period} onChange={e => setPeriod(e.target.value)} data-testid="period-select" style={{ width: 'auto' }}>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 90 Days</option>
          </select>
          <button className="btn btn-primary btn-sm" onClick={() => handleExport('pdf')} data-testid="export-pdf-btn">Export PDF</button>
          <button className="btn btn-accent btn-sm" onClick={() => handleExport('csv')} data-testid="export-csv-btn">Export CSV</button>
        </div>

        {loading && <div data-testid="loading-indicator" className="p-4"><div className="skeleton-heading mb-3" /><div className="skeleton-line" /><div className="skeleton-line medium" /><div className="skeleton-line short" /></div>}
        {error && <div data-testid="error-message" role="alert" className="alert-box alert-error">{error}</div>}

        {!loading && !error && report && (
          <div data-testid="report-content">
            <div data-testid="dau-section" className="card mb-4">
              <div className="card-header">Daily Active Users</div>
              <div className="card-body">
                <div style={{ width: '100%', height: 220 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={report.daily_active_users} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#9ca3af" tickFormatter={(v: string) => v.slice(5)} />
                      <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" />
                      <Tooltip labelStyle={{ fontWeight: 600 }} />
                      <Bar dataKey="count" fill="#16a34a" radius={[4, 4, 0, 0]} name="Users" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div data-testid="feature-adoption-section" className="card mb-4">
              <div className="card-header">Feature Adoption</div>
              <div className="card-body">
                <div style={{ width: '100%', height: 260 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={report.feature_adoption} layout="vertical" margin={{ top: 5, right: 20, left: 80, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis type="number" tick={{ fontSize: 11 }} stroke="#9ca3af" domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} />
                      <YAxis type="category" dataKey="feature" tick={{ fontSize: 11 }} stroke="#9ca3af" width={75} />
                      <Tooltip formatter={(value) => [`${value ?? 0}%`, 'Adoption']} />
                      <Bar dataKey="rate" fill="#15803d" radius={[0, 4, 4, 0]} name="Adoption Rate" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div data-testid="ai-interactions-section" className="card mb-4">
              <div className="card-header">AI Interactions</div>
              <div className="card-body">
                <div style={{ width: '100%', height: 220, marginBottom: 16 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={report.ai_interactions} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#9ca3af" tickFormatter={(v: string) => v.slice(5)} />
                      <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" />
                      <Tooltip labelStyle={{ fontWeight: 600 }} />
                      <Bar dataKey="queries" fill="#16a34a" radius={[4, 4, 0, 0]} name="Queries" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th><th>Queries</th><th>Accuracy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.ai_interactions.map(ai => (
                      <tr key={ai.date}>
                        <td>{ai.date}</td>
                        <td>{ai.queries}</td>
                        <td>{ai.accuracy}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div data-testid="farmer-outcomes-section">
              <h3 className="mb-3">Farmer Outcomes</h3>
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 16 }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div className="stat-grid">
                    {report.farmer_outcomes.map(o => (
                      <div key={o.metric} className="stat-card" style={{ background: 'var(--accent-light)' }}>
                        <div className="stat-value">{o.value.toLocaleString('en-IN')}</div>
                        <div className="stat-label">{o.metric}</div>
                        <div className={`stat-change ${o.change_pct >= 0 ? 'positive' : 'negative'}`}>
                          {o.change_pct >= 0 ? '↑' : '↓'} {Math.abs(o.change_pct)}%
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ width: 220, height: 220 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={report.farmer_outcomes} dataKey="value" nameKey="metric" cx="50%" cy="50%" outerRadius={80} label={({ name }: { name?: string }) => name || ''}>
                        {report.farmer_outcomes.map((_, i) => (
                          <Cell key={i} fill={['#16a34a', '#15803d', '#166534', '#22c55e'][i % 4]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => [Number(value ?? 0).toLocaleString('en-IN'), '']} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
