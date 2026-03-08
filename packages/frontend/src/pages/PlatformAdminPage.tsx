import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '../i18n';
import {
  getTenantDashboard, createTenant, suspendTenant, getGlobalAIConfig, updateGlobalAIConfig,
  getCrossTenantAnalytics, getFeatureFlags, updateFeatureFlags, scheduleMaintenance, getMaintenanceWindows,
  TenantInfo, GlobalAIConfig, CrossTenantAnalytics, FeatureFlags, MaintenanceWindow,
} from '../services/adminClient';

type Tab = 'tenants' | 'config' | 'analytics' | 'flags' | 'maintenance';

export const PlatformAdminPage: React.FC = () => {
  const { t } = useTranslation();
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
    { key: 'tenants', label: t('tabTenants') },
    { key: 'config', label: t('tabAiConfig') },
    { key: 'analytics', label: t('tabAnalytics') },
    { key: 'flags', label: t('tabFeatureFlags') },
    { key: 'maintenance', label: t('tabMaintenance') },
  ];

  const statusBadge = (s: string) => s === 'active' ? 'badge badge-green' : s === 'suspended' ? 'badge badge-yellow' : 'badge badge-red';

  return (
    <div className="page-container fade-in" data-testid="platform-admin-page">
      <div className="section-header-light">⚙️ {t('platformAdmin')}</div>
      <div className="tab-bar">
        {tabs.map(tab => (
          <button key={tab.key} className={`tab-btn ${activeTab === tab.key ? 'active' : ''}`} onClick={() => setActiveTab(tab.key)} data-testid={`tab-${tab.key}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {loading && <div data-testid="loading-indicator" className="p-4"><div className="skeleton-heading mb-3" /><div className="skeleton-line" /><div className="skeleton-line medium" /><div className="skeleton-line short" /></div>}
      {error && <div data-testid="error-message" role="alert" className="alert-box alert-error">{error}</div>}

      {!loading && !error && (
        <div data-testid="tab-content">
          {activeTab === 'tenants' && (
            <div className="mt-4" data-testid="tenants-section">
              <div className="form-section">
                <div className="form-section-title">Create Tenant</div>
                <div className="form-row mb-3">
                  <div className="form-group">
                    <input className="form-input" placeholder="Tenant Name" value={newTenantForm.name} onChange={e => setNewTenantForm(f => ({ ...f, name: e.target.value }))} data-testid="tenant-name" />
                  </div>
                  <div className="form-group">
                    <select className="form-select" value={newTenantForm.type} onChange={e => setNewTenantForm(f => ({ ...f, type: e.target.value }))} data-testid="tenant-type">
                      <option value="FPO">FPO</option><option value="NGO">NGO</option><option value="Cooperative">Cooperative</option>
                    </select>
                  </div>
                </div>
                <div className="form-row mb-3">
                  <div className="form-group">
                    <input className="form-input" placeholder="Admin Name" value={newTenantForm.admin_name} onChange={e => setNewTenantForm(f => ({ ...f, admin_name: e.target.value }))} data-testid="tenant-admin-name" />
                  </div>
                  <div className="form-group">
                    <input className="form-input" placeholder="Admin Phone" value={newTenantForm.admin_phone} onChange={e => setNewTenantForm(f => ({ ...f, admin_phone: e.target.value }))} data-testid="tenant-admin-phone" />
                  </div>
                </div>
                <button className="btn btn-primary" onClick={handleCreateTenant} data-testid="create-tenant-btn">Create</button>
              </div>
              <div className="card">
                <table className="data-table" data-testid="tenants-table">
                  <thead>
                    <tr>
                      <th>Name</th><th>Type</th><th>Status</th><th>Users</th><th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tenants.map(t => (
                      <tr key={t.id} data-testid={`tenant-row-${t.id}`}>
                        <td>{t.name}</td>
                        <td>{t.type}</td>
                        <td><span className={statusBadge(t.status)}>{t.status}</span></td>
                        <td>{t.user_count}</td>
                        <td>
                          {t.status === 'active' && <button className="btn btn-danger btn-sm" onClick={() => handleSuspendTenant(t.id)} data-testid={`suspend-${t.id}`}>Suspend</button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mobile-card-list" data-testid="tenants-mobile-cards">
                  {tenants.map(t => (
                    <div key={t.id} className="mobile-card-item" data-testid={`tenant-card-${t.id}`}>
                      <div className="mobile-card-row">
                        <span className="mobile-card-label">Name</span>
                        <span className="mobile-card-value">{t.name}</span>
                      </div>
                      <div className="mobile-card-row">
                        <span className="mobile-card-label">Type</span>
                        <span className="mobile-card-value">{t.type}</span>
                      </div>
                      <div className="mobile-card-row">
                        <span className="mobile-card-label">Status</span>
                        <span className="mobile-card-value"><span className={statusBadge(t.status)}>{t.status}</span></span>
                      </div>
                      <div className="mobile-card-row">
                        <span className="mobile-card-label">Users</span>
                        <span className="mobile-card-value">{t.user_count}</span>
                      </div>
                      {t.status === 'active' && (
                        <div className="mobile-card-row">
                          <span className="mobile-card-label">Actions</span>
                          <span className="mobile-card-value">
                            <button className="btn btn-danger btn-sm" onClick={() => handleSuspendTenant(t.id)}>Suspend</button>
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'config' && aiConfig && (
            <div className="form-section mt-4" data-testid="config-section">
              <div className="form-section-title">Global AI Configuration</div>
              <div className="form-group">
                <label className="form-label">Primary Model</label>
                <input className="form-input" value={aiConfig.primary_model} onChange={e => setAiConfig(c => c ? { ...c, primary_model: e.target.value } : c)} data-testid="ai-primary-model" />
              </div>
              <div className="form-group">
                <label className="form-label">Fallback Model</label>
                <input className="form-input" value={aiConfig.fallback_model} onChange={e => setAiConfig(c => c ? { ...c, fallback_model: e.target.value } : c)} data-testid="ai-fallback-model" />
              </div>
              <div className="form-group">
                <label className="form-label">Safety Level</label>
                <select className="form-select" value={aiConfig.safety_level} onChange={e => setAiConfig(c => c ? { ...c, safety_level: e.target.value as GlobalAIConfig['safety_level'] } : c)} data-testid="ai-safety-level">
                  <option value="strict">Strict</option><option value="moderate">Moderate</option><option value="relaxed">Relaxed</option>
                </select>
              </div>
              <button className="btn btn-primary" onClick={handleSaveAIConfig} data-testid="save-ai-config-btn">Save Configuration</button>
            </div>
          )}

          {activeTab === 'analytics' && crossAnalytics && (
            <div className="mt-4" data-testid="cross-analytics-section">
              <h3 className="mb-3">Cross-Tenant Analytics</h3>
              <div className="stat-grid mb-4">
                <div className="stat-card" style={{ background: '#f3e8ff' }} data-testid="stat-total-tenants">
                  <div className="stat-value">{crossAnalytics.total_tenants}</div>
                  <div className="stat-label">Tenants</div>
                </div>
                <div className="stat-card" style={{ background: 'var(--accent-light)' }} data-testid="stat-total-users">
                  <div className="stat-value">{crossAnalytics.total_users}</div>
                  <div className="stat-label">Users</div>
                </div>
                <div className="stat-card" style={{ background: 'var(--success-light)' }} data-testid="stat-total-queries">
                  <div className="stat-value">{crossAnalytics.total_ai_queries}</div>
                  <div className="stat-label">AI Queries</div>
                </div>
                <div className="stat-card" style={{ background: 'var(--warning-light)' }} data-testid="stat-avg-response">
                  <div className="stat-value">{crossAnalytics.avg_response_time_ms}ms</div>
                  <div className="stat-label">Avg Response</div>
                </div>
              </div>
              <div data-testid="queries-by-day">
                <h4 className="mb-2">Queries by Day</h4>
                {crossAnalytics.queries_by_day.map(d => (
                  <div key={d.date} className="flex items-center gap-2 mb-1">
                    <span className="text-xs" style={{ width: 100 }}>{d.date}</span>
                    <div className="progress-bar" style={{ flex: 1 }}>
                      <div className="progress-fill" style={{ width: `${(d.count / 1200) * 100}%` }} />
                    </div>
                    <span className="text-xs" style={{ width: 50, textAlign: 'right' }}>{d.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'flags' && (
            <div className="mt-4" data-testid="flags-section">
              <h3 className="mb-3">Feature Flags</h3>
              {tenants.length > 0 && (
                <div className="form-group">
                  <label className="form-label">Select Tenant</label>
                  <select className="form-select" value={selectedTenantId} onChange={async e => { setSelectedTenantId(e.target.value); setFeatureFlags(await getFeatureFlags(e.target.value)); }} data-testid="flag-tenant-select">
                    {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              )}
              {featureFlags && Object.entries(featureFlags).map(([feature, enabled]) => (
                <div key={feature} className="flex items-center justify-between p-3 mb-2" style={{ background: 'var(--gray-50)', borderRadius: 'var(--radius-md)' }} data-testid={`flag-${feature}`}>
                  <span className="text-sm">{feature.replace(/_/g, ' ')}</span>
                  <button className={`toggle-switch ${enabled ? 'active' : ''}`} onClick={() => handleToggleFlag(feature)} data-testid={`toggle-${feature}`} aria-label={enabled ? 'Enabled' : 'Disabled'} />
                </div>
              ))}
            </div>
          )}

          {activeTab === 'maintenance' && (
            <div className="mt-4" data-testid="maintenance-section">
              <div className="form-section">
                <div className="form-section-title">Schedule Maintenance</div>
                <div className="form-group">
                  <input className="form-input" placeholder="Title" value={maintenanceForm.title} onChange={e => setMaintenanceForm(f => ({ ...f, title: e.target.value }))} data-testid="maint-title" />
                </div>
                <div className="form-group">
                  <input className="form-input" placeholder="Description" value={maintenanceForm.description} onChange={e => setMaintenanceForm(f => ({ ...f, description: e.target.value }))} data-testid="maint-description" />
                </div>
                <div className="form-row mb-3">
                  <div className="form-group">
                    <label className="form-label">Start</label>
                    <input className="form-input" type="datetime-local" value={maintenanceForm.scheduled_start} onChange={e => setMaintenanceForm(f => ({ ...f, scheduled_start: e.target.value }))} data-testid="maint-start" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">End</label>
                    <input className="form-input" type="datetime-local" value={maintenanceForm.scheduled_end} onChange={e => setMaintenanceForm(f => ({ ...f, scheduled_end: e.target.value }))} data-testid="maint-end" />
                  </div>
                </div>
                <button className="btn btn-primary" onClick={handleScheduleMaintenance} data-testid="schedule-maint-btn">Schedule</button>
              </div>
              {maintenanceWindows.map(mw => (
                <div key={mw.id} data-testid={`maint-${mw.id}`} className="card mb-3">
                  <div className="card-body">
                    <div className="font-semibold">{mw.title}</div>
                    <div className="text-sm text-muted mt-1">{mw.description}</div>
                    <div className="text-xs text-muted mt-1">
                      {new Date(mw.scheduled_start).toLocaleString()} — {new Date(mw.scheduled_end).toLocaleString()}
                    </div>
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
