import React, { useState, useEffect, useCallback } from 'react';
import {
  getTenantDashboard, createTenant, suspendTenant, getGlobalAIConfig, updateGlobalAIConfig,
  getCrossTenantAnalytics, getFeatureFlags, updateFeatureFlags, scheduleMaintenance, getMaintenanceWindows,
  TenantInfo, GlobalAIConfig, CrossTenantAnalytics, FeatureFlags, MaintenanceWindow,
} from '../services/adminClient';

type Tab = 'tenants' | 'config' | 'analytics' | 'flags' | 'maintenance';

export const PlatformAdminPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('tenants');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tenants, setTenants] = useState<TenantInfo[]>([]);
  const [newTenantForm, setNewTenantForm] = useState({ name: '', type: 'FPO', admin_name: '', admin_phone: '' });
  const [aiConfig, setAiConfig] = useState<GlobalAIConfig | null>(null);
  const [crossAnalytics, setCrossAnalytics] = useState<CrossTenantAnalytics | null>(null);
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');
  const [featureFlags, setFeatureFlags] = useState<FeatureFlags | null>(null);
  const [maintenanceWindows, setMaintenanceWindows] = useState<MaintenanceWindow[]>([]);
  const [maintenanceForm, setMaintenanceForm] = useState({ title: '', description: '', scheduled_start: '', scheduled_end: '' });

  const loadTabData = useCallback(async (tab: Tab, currentTenantId?: string) => {
    setLoading(true);
    setError(null);
    try {
      switch (tab) {
        case 'tenants': { setTenants(await getTenantDashboard()); break; }
        case 'config': { setAiConfig(await getGlobalAIConfig()); break; }
        case 'analytics': { setCrossAnalytics(await getCrossTenantAnalytics()); break; }
        case 'flags': {
          const t = await getTenantDashboard();
          setTenants(t);
          const tenantId = currentTenantId || (t.length > 0 ? t[0].id : '');
          if (t.length > 0 && !currentTenantId) setSelectedTenantId(t[0].id);
          if (tenantId) setFeatureFlags(await getFeatureFlags(tenantId));
          break;
        }
        case 'maintenance': { setMaintenanceWindows(await getMaintenanceWindows()); break; }
      }
    } catch { setError('Failed to load data.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadTabData(activeTab, selectedTenantId || undefined); }, [activeTab, loadTabData]);

  const handleCreateTenant = async () => {
    if (!newTenantForm.name || !newTenantForm.admin_name || !newTenantForm.admin_phone) return;
    setLoading(true);
    try {
      const tenant = await createTenant(newTenantForm);
      setTenants(prev => [...prev, tenant]);
      setNewTenantForm({ name: '', type: 'FPO', admin_name: '', admin_phone: '' });
    } catch { setError('Failed to create tenant.'); }
    finally { setLoading(false); }
  };

  const handleSuspendTenant = async (tenantId: string) => {
    setLoading(true);
    try {
      const updated = await suspendTenant(tenantId, 'Suspended by admin');
      setTenants(prev => prev.map(t => t.id === tenantId ? { ...t, status: updated.status } : t));
    } catch { setError('Failed to suspend tenant.'); }
    finally { setLoading(false); }
  };

  const handleSaveAIConfig = async () => {
    if (!aiConfig) return;
    setLoading(true);
    try { setAiConfig(await updateGlobalAIConfig(aiConfig)); }
    catch { setError('Failed to save AI config.'); }
    finally { setLoading(false); }
  };

  const handleToggleFlag = async (feature: string) => {
    if (!featureFlags || !selectedTenantId) return;
    const updated = { ...featureFlags, [feature]: !featureFlags[feature] };
    try {
      setFeatureFlags(await updateFeatureFlags(selectedTenantId, updated));
    } catch { setError('Failed to update feature flag.'); }
  };

  const handleScheduleMaintenance = async () => {
    if (!maintenanceForm.title || !maintenanceForm.scheduled_start || !maintenanceForm.scheduled_end) return;
    setLoading(true);
    try {
      const mw = await scheduleMaintenance(maintenanceForm);
      setMaintenanceWindows(prev => [...prev, mw]);
      setMaintenanceForm({ title: '', description: '', scheduled_start: '', scheduled_end: '' });
    } catch { setError('Failed to schedule maintenance.'); }
    finally { setLoading(false); }
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'tenants', label: 'Tenants' },
    { key: 'config', label: 'AI Config' },
    { key: 'analytics', label: 'Analytics' },
    { key: 'flags', label: 'Feature Flags' },
    { key: 'maintenance', label: 'Maintenance' },
  ];

  const containerStyle: React.CSSProperties = { maxWidth: 800, margin: '0 auto', fontFamily: 'sans-serif' };
  const headerStyle: React.CSSProperties = { padding: '12px 16px', backgroundColor: '#6a1b9a', color: '#fff', fontWeight: 600, fontSize: 18 };
  const tabBarStyle: React.CSSProperties = { display: 'flex', borderBottom: '2px solid #e0e0e0', backgroundColor: '#fff' };
  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '10px 0', textAlign: 'center', cursor: 'pointer', fontWeight: active ? 700 : 400,
    color: active ? '#6a1b9a' : '#666', border: 'none', borderBottom: active ? '3px solid #6a1b9a' : '3px solid transparent', backgroundColor: 'transparent', fontSize: 14,
  });
  const sectionStyle: React.CSSProperties = { padding: 16 };
  const inputStyle: React.CSSProperties = { padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4, fontSize: 14, marginRight: 8, marginBottom: 8 };
  const btnStyle: React.CSSProperties = { padding: '6px 16px', backgroundColor: '#6a1b9a', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 14 };
  const dangerBtnStyle: React.CSSProperties = { ...btnStyle, backgroundColor: '#c62828' };
  const statusColor = (s: string) => s === 'active' ? '#2e7d32' : s === 'suspended' ? '#e65100' : '#c62828';

  return (
    <div style={containerStyle} data-testid="platform-admin-page">
      <div style={headerStyle}>Platform Administration</div>
      <div style={tabBarStyle}>
        {tabs.map(tab => (
          <button key={tab.key} style={tabStyle(activeTab === tab.key)} onClick={() => setActiveTab(tab.key)} data-testid={`tab-${tab.key}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {loading && <div data-testid="loading-indicator" style={{ padding: 24, textAlign: 'center', color: '#666' }}>Loading...</div>}
      {error && <div data-testid="error-message" role="alert" style={{ padding: '8px 16px', backgroundColor: '#ffebee', color: '#c62828', fontSize: 13 }}>{error}</div>}

      {!loading && !error && (
        <div data-testid="tab-content">
          {activeTab === 'tenants' && (
            <div style={sectionStyle} data-testid="tenants-section">
              <h3>Tenant Management</h3>
              <div style={{ marginBottom: 16, padding: 12, backgroundColor: '#f5f5f5', borderRadius: 8 }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>Create Tenant</div>
                <input style={inputStyle} placeholder="Tenant Name" value={newTenantForm.name} onChange={e => setNewTenantForm(f => ({ ...f, name: e.target.value }))} data-testid="tenant-name" />
                <select style={inputStyle} value={newTenantForm.type} onChange={e => setNewTenantForm(f => ({ ...f, type: e.target.value }))} data-testid="tenant-type">
                  <option value="FPO">FPO</option><option value="NGO">NGO</option><option value="Cooperative">Cooperative</option>
                </select>
                <input style={inputStyle} placeholder="Admin Name" value={newTenantForm.admin_name} onChange={e => setNewTenantForm(f => ({ ...f, admin_name: e.target.value }))} data-testid="tenant-admin-name" />
                <input style={inputStyle} placeholder="Admin Phone" value={newTenantForm.admin_phone} onChange={e => setNewTenantForm(f => ({ ...f, admin_phone: e.target.value }))} data-testid="tenant-admin-phone" />
                <button style={btnStyle} onClick={handleCreateTenant} data-testid="create-tenant-btn">Create</button>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }} data-testid="tenants-table">
                <thead>
                  <tr style={{ borderBottom: '2px solid #e0e0e0', textAlign: 'left' }}>
                    <th style={{ padding: 8 }}>Name</th><th style={{ padding: 8 }}>Type</th><th style={{ padding: 8 }}>Status</th><th style={{ padding: 8 }}>Users</th><th style={{ padding: 8 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tenants.map(t => (
                    <tr key={t.id} data-testid={`tenant-row-${t.id}`} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: 8 }}>{t.name}</td>
                      <td style={{ padding: 8 }}>{t.type}</td>
                      <td style={{ padding: 8, color: statusColor(t.status), fontWeight: 600 }}>{t.status}</td>
                      <td style={{ padding: 8 }}>{t.user_count}</td>
                      <td style={{ padding: 8 }}>
                        {t.status === 'active' && <button style={dangerBtnStyle} onClick={() => handleSuspendTenant(t.id)} data-testid={`suspend-${t.id}`}>Suspend</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'config' && aiConfig && (
            <div style={sectionStyle} data-testid="config-section">
              <h3>Global AI Configuration</h3>
              <div style={{ marginBottom: 12 }}>
                <label>Primary Model<br />
                  <input style={inputStyle} value={aiConfig.primary_model} onChange={e => setAiConfig(c => c ? { ...c, primary_model: e.target.value } : c)} data-testid="ai-primary-model" />
                </label>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label>Fallback Model<br />
                  <input style={inputStyle} value={aiConfig.fallback_model} onChange={e => setAiConfig(c => c ? { ...c, fallback_model: e.target.value } : c)} data-testid="ai-fallback-model" />
                </label>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label>Safety Level<br />
                  <select style={inputStyle} value={aiConfig.safety_level} onChange={e => setAiConfig(c => c ? { ...c, safety_level: e.target.value as GlobalAIConfig['safety_level'] } : c)} data-testid="ai-safety-level">
                    <option value="strict">Strict</option><option value="moderate">Moderate</option><option value="relaxed">Relaxed</option>
                  </select>
                </label>
              </div>
              <button style={btnStyle} onClick={handleSaveAIConfig} data-testid="save-ai-config-btn">Save Configuration</button>
            </div>
          )}

          {activeTab === 'analytics' && crossAnalytics && (
            <div style={sectionStyle} data-testid="cross-analytics-section">
              <h3>Cross-Tenant Analytics</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div data-testid="stat-total-tenants" style={{ padding: 12, backgroundColor: '#f3e5f5', borderRadius: 8, textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 700 }}>{crossAnalytics.total_tenants}</div>
                  <div style={{ fontSize: 12, color: '#666' }}>Tenants</div>
                </div>
                <div data-testid="stat-total-users" style={{ padding: 12, backgroundColor: '#e3f2fd', borderRadius: 8, textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 700 }}>{crossAnalytics.total_users}</div>
                  <div style={{ fontSize: 12, color: '#666' }}>Users</div>
                </div>
                <div data-testid="stat-total-queries" style={{ padding: 12, backgroundColor: '#e8f5e9', borderRadius: 8, textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 700 }}>{crossAnalytics.total_ai_queries}</div>
                  <div style={{ fontSize: 12, color: '#666' }}>AI Queries</div>
                </div>
                <div data-testid="stat-avg-response" style={{ padding: 12, backgroundColor: '#fff3e0', borderRadius: 8, textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 700 }}>{crossAnalytics.avg_response_time_ms}ms</div>
                  <div style={{ fontSize: 12, color: '#666' }}>Avg Response</div>
                </div>
              </div>
              <div data-testid="queries-by-day">
                <h4>Queries by Day</h4>
                {crossAnalytics.queries_by_day.map(d => (
                  <div key={d.date} style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ width: 100, fontSize: 12 }}>{d.date}</span>
                    <div style={{ flex: 1, height: 16, backgroundColor: '#e0e0e0', borderRadius: 4 }}>
                      <div style={{ height: '100%', width: `${(d.count / 1200) * 100}%`, backgroundColor: '#6a1b9a', borderRadius: 4 }} />
                    </div>
                    <span style={{ width: 50, textAlign: 'right', fontSize: 12 }}>{d.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'flags' && (
            <div style={sectionStyle} data-testid="flags-section">
              <h3>Feature Flags</h3>
              {tenants.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <label>Select Tenant: </label>
                  <select style={inputStyle} value={selectedTenantId} onChange={async e => { setSelectedTenantId(e.target.value); setFeatureFlags(await getFeatureFlags(e.target.value)); }} data-testid="flag-tenant-select">
                    {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              )}
              {featureFlags && Object.entries(featureFlags).map(([feature, enabled]) => (
                <div key={feature} style={{ display: 'flex', alignItems: 'center', marginBottom: 8, padding: 8, backgroundColor: '#f5f5f5', borderRadius: 4 }} data-testid={`flag-${feature}`}>
                  <span style={{ flex: 1, fontSize: 14 }}>{feature.replace(/_/g, ' ')}</span>
                  <button style={{ ...btnStyle, backgroundColor: enabled ? '#2e7d32' : '#9e9e9e', minWidth: 80 }} onClick={() => handleToggleFlag(feature)} data-testid={`toggle-${feature}`}>
                    {enabled ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'maintenance' && (
            <div style={sectionStyle} data-testid="maintenance-section">
              <h3>Maintenance Scheduling</h3>
              <div style={{ marginBottom: 16, padding: 12, backgroundColor: '#f5f5f5', borderRadius: 8 }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>Schedule Maintenance</div>
                <input style={inputStyle} placeholder="Title" value={maintenanceForm.title} onChange={e => setMaintenanceForm(f => ({ ...f, title: e.target.value }))} data-testid="maint-title" />
                <input style={inputStyle} placeholder="Description" value={maintenanceForm.description} onChange={e => setMaintenanceForm(f => ({ ...f, description: e.target.value }))} data-testid="maint-description" />
                <input style={inputStyle} type="datetime-local" value={maintenanceForm.scheduled_start} onChange={e => setMaintenanceForm(f => ({ ...f, scheduled_start: e.target.value }))} data-testid="maint-start" />
                <input style={inputStyle} type="datetime-local" value={maintenanceForm.scheduled_end} onChange={e => setMaintenanceForm(f => ({ ...f, scheduled_end: e.target.value }))} data-testid="maint-end" />
                <button style={btnStyle} onClick={handleScheduleMaintenance} data-testid="schedule-maint-btn">Schedule</button>
              </div>
              {maintenanceWindows.map(mw => (
                <div key={mw.id} data-testid={`maint-${mw.id}`} style={{ padding: 12, marginBottom: 8, backgroundColor: '#fff3e0', borderRadius: 8 }}>
                  <div style={{ fontWeight: 600 }}>{mw.title}</div>
                  <div style={{ fontSize: 13, color: '#555' }}>{mw.description}</div>
                  <div style={{ fontSize: 12, color: '#888' }}>
                    {new Date(mw.scheduled_start).toLocaleString()} — {new Date(mw.scheduled_end).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
