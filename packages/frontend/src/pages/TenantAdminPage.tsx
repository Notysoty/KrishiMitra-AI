import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '../i18n';
import {
  getBranding, updateBranding, listUsers, addUser, removeUser, bulkImportUsers,
  updateRegionalPreferences, getPendingContent, reviewContent, getUsageAnalytics,
  BrandingConfig, TenantUser, PendingContent, UsageAnalytics, RegionalPreferences, BulkImportResult,
} from '../services/adminClient';

type Tab = 'branding' | 'users' | 'regional' | 'content' | 'analytics';

export const TenantAdminPage: React.FC = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>('branding');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [branding, setBranding] = useState<BrandingConfig | null>(null);
  const [brandingForm, setBrandingForm] = useState({ org_name: '', primary_color: '', secondary_color: '', logo_url: '' });

  const [users, setUsers] = useState<TenantUser[]>([]);
  const [newUserForm, setNewUserForm] = useState({ phone: '', name: '', roles: 'Farmer' });
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<BulkImportResult | null>(null);

  const [regional, setRegional] = useState<RegionalPreferences | null>(null);

  const [pendingContent, setPendingContent] = useState<PendingContent[]>([]);

  const [analytics, setAnalytics] = useState<UsageAnalytics | null>(null);

  const loadTabData = useCallback(async (tab: Tab) => {
    setLoading(true);
    setError(null);
    try {
      switch (tab) {
        case 'branding': {
          const data = await getBranding();
          setBranding(data);
          setBrandingForm({ org_name: data.org_name, primary_color: data.primary_color, secondary_color: data.secondary_color, logo_url: data.logo_url });
          break;
        }
        case 'users': {
          const data = await listUsers();
          setUsers(data.items);
          break;
        }
        case 'regional': {
          const data = await updateRegionalPreferences({});
          setRegional(data);
          break;
        }
        case 'content': {
          const data = await getPendingContent();
          setPendingContent(data.items);
          break;
        }
        case 'analytics': {
          const data = await getUsageAnalytics();
          setAnalytics(data);
          break;
        }
      }
    } catch {
      setError('Failed to load data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTabData(activeTab); }, [activeTab, loadTabData]);

  const handleSaveBranding = async () => {
    setLoading(true);
    try {
      const updated = await updateBranding(brandingForm);
      setBranding(updated);
    } catch { setError('Failed to save branding.'); }
    finally { setLoading(false); }
  };

  const handleAddUser = async () => {
    if (!newUserForm.phone || !newUserForm.name) return;
    setLoading(true);
    try {
      const user = await addUser({ phone: newUserForm.phone, name: newUserForm.name, roles: [newUserForm.roles] });
      setUsers(prev => [...prev, user]);
      setNewUserForm({ phone: '', name: '', roles: 'Farmer' });
    } catch { setError('Failed to add user.'); }
    finally { setLoading(false); }
  };

  const handleRemoveUser = async (userId: string) => {
    setLoading(true);
    try {
      await removeUser(userId);
      setUsers(prev => prev.filter(u => u.id !== userId));
    } catch { setError('Failed to remove user.'); }
    finally { setLoading(false); }
  };

  const handleBulkImport = async () => {
    if (!csvFile) return;
    setLoading(true);
    try {
      const text = await csvFile.text();
      const lines = text.trim().split('\n').slice(1);
      const parsed = lines.map(line => {
        const [phone, name, roles] = line.split(',');
        return { phone: phone?.trim(), name: name?.trim(), roles: roles?.trim() || 'Farmer' };
      });
      const result = await bulkImportUsers(parsed);
      setImportResult(result);
      setCsvFile(null);
      loadTabData('users');
    } catch { setError('Failed to import users.'); }
    finally { setLoading(false); }
  };

  const handleReviewContent = async (articleId: string, action: 'approve' | 'reject') => {
    setLoading(true);
    try {
      await reviewContent(articleId, action);
      setPendingContent(prev => prev.filter(c => c.article_id !== articleId));
    } catch { setError('Failed to review content.'); }
    finally { setLoading(false); }
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'branding', label: t('tabBranding') },
    { key: 'users', label: t('tabUsers') },
    { key: 'regional', label: t('regionalPreferences') },
    { key: 'content', label: t('tabContent') },
    { key: 'analytics', label: t('tabAnalytics') },
  ];

  return (
    <div className="page-container fade-in" data-testid="tenant-admin-page">
      <div className="section-header-light">🏢 {t('tenantAdmin')}</div>
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
          {activeTab === 'branding' && branding && (
            <div className="form-section mt-4" data-testid="branding-section">
              <div className="form-section-title">Organization Branding</div>
              <div className="form-group">
                <label className="form-label">Organization Name</label>
                <input className="form-input" value={brandingForm.org_name} onChange={e => setBrandingForm(f => ({ ...f, org_name: e.target.value }))} data-testid="branding-org-name" />
              </div>
              <div className="form-group">
                <label className="form-label">Primary Color</label>
                <input className="form-input" type="color" value={brandingForm.primary_color} onChange={e => setBrandingForm(f => ({ ...f, primary_color: e.target.value }))} data-testid="branding-primary-color" />
              </div>
              <div className="form-group">
                <label className="form-label">Logo URL</label>
                <input className="form-input" value={brandingForm.logo_url} onChange={e => setBrandingForm(f => ({ ...f, logo_url: e.target.value }))} data-testid="branding-logo-url" />
              </div>
              <button className="btn btn-primary" onClick={handleSaveBranding} data-testid="save-branding-btn">Save Branding</button>
            </div>
          )}

          {activeTab === 'users' && (
            <div className="mt-4" data-testid="users-section">
              <div className="form-section">
                <div className="form-section-title">Add User</div>
                <div className="form-row mb-3">
                  <div className="form-group">
                    <input className="form-input" placeholder="Phone" value={newUserForm.phone} onChange={e => setNewUserForm(f => ({ ...f, phone: e.target.value }))} data-testid="add-user-phone" />
                  </div>
                  <div className="form-group">
                    <input className="form-input" placeholder="Name" value={newUserForm.name} onChange={e => setNewUserForm(f => ({ ...f, name: e.target.value }))} data-testid="add-user-name" />
                  </div>
                </div>
                <div className="flex gap-2 items-center">
                  <select className="form-select" value={newUserForm.roles} onChange={e => setNewUserForm(f => ({ ...f, roles: e.target.value }))} data-testid="add-user-role" style={{ width: 'auto' }}>
                    <option value="Farmer">Farmer</option>
                    <option value="Field_Officer">Field Officer</option>
                    <option value="Agronomist">Agronomist</option>
                    <option value="Buyer">Buyer</option>
                  </select>
                  <button className="btn btn-primary" onClick={handleAddUser} data-testid="add-user-btn">Add</button>
                </div>
              </div>
              <div className="form-section">
                <div className="form-section-title">Bulk CSV Import</div>
                <div className="flex gap-2 items-center">
                  <input type="file" accept=".csv" onChange={e => setCsvFile(e.target.files?.[0] || null)} data-testid="csv-file-input" />
                  <button className="btn btn-primary" onClick={handleBulkImport} disabled={!csvFile} data-testid="bulk-import-btn">Import</button>
                </div>
                {importResult && <div data-testid="import-result" className="text-sm mt-2">Imported: {importResult.imported}, Failed: {importResult.failed}</div>}
              </div>
              <div className="card">
                <table className="data-table" data-testid="users-table">
                  <thead>
                    <tr>
                      <th>Name</th><th>Phone</th><th>Roles</th><th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(u => (
                      <tr key={u.id} data-testid={`user-row-${u.id}`}>
                        <td>{u.name}</td>
                        <td>{u.phone}</td>
                        <td>{u.roles.join(', ')}</td>
                        <td><button className="btn btn-danger btn-sm" onClick={() => handleRemoveUser(u.id)} data-testid={`remove-user-${u.id}`}>Remove</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mobile-card-list" data-testid="users-mobile-cards">
                  {users.map(u => (
                    <div key={u.id} className="mobile-card-item" data-testid={`user-card-${u.id}`}>
                      <div className="mobile-card-row">
                        <span className="mobile-card-label">Name</span>
                        <span className="mobile-card-value">{u.name}</span>
                      </div>
                      <div className="mobile-card-row">
                        <span className="mobile-card-label">Phone</span>
                        <span className="mobile-card-value">{u.phone}</span>
                      </div>
                      <div className="mobile-card-row">
                        <span className="mobile-card-label">Roles</span>
                        <span className="mobile-card-value">{u.roles.join(', ')}</span>
                      </div>
                      <div className="mobile-card-row">
                        <span className="mobile-card-label">Actions</span>
                        <span className="mobile-card-value">
                          <button className="btn btn-danger btn-sm" onClick={() => handleRemoveUser(u.id)}>Remove</button>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'regional' && regional && (
            <div className="form-section mt-4" data-testid="regional-section">
              <div className="form-section-title">Regional Preferences</div>
              <div className="mb-2"><strong>Languages:</strong> {regional.supported_languages.join(', ')}</div>
              <div className="mb-2"><strong>Crops:</strong> {regional.supported_crops.join(', ')}</div>
              <div className="mb-2"><strong>Markets:</strong> {regional.supported_markets.join(', ')}</div>
              <div><strong>Default Region:</strong> {regional.default_region}</div>
            </div>
          )}

          {activeTab === 'content' && (
            <div className="mt-4" data-testid="content-section">
              <h3 className="mb-3">Content Approval</h3>
              {pendingContent.length === 0 && <div data-testid="no-pending-content" className="empty-state"><div className="empty-text">No pending content for review.</div></div>}
              {pendingContent.map(item => (
                <div key={item.id} data-testid={`content-item-${item.id}`} className="card mb-3">
                  <div className="card-body">
                    <div className="font-semibold mb-2">{item.title}</div>
                    <div className="text-sm text-muted mb-2">{item.content_snapshot}</div>
                    <div className="text-xs text-muted mb-3">Confidence: {(item.confidence_score * 100).toFixed(0)}% | Sources: {item.sources.join(', ')}</div>
                    <div className="flex gap-2">
                      <button className="btn btn-primary btn-sm" onClick={() => handleReviewContent(item.article_id, 'approve')} data-testid={`approve-${item.id}`}>Approve</button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleReviewContent(item.article_id, 'reject')} data-testid={`reject-${item.id}`}>Reject</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'analytics' && analytics && (
            <div className="mt-4" data-testid="analytics-section">
              <h3 className="mb-3">Usage Analytics</h3>
              <div className="stat-grid mb-4">
                <div className="stat-card" style={{ background: 'var(--primary-50)' }} data-testid="stat-active-users">
                  <div className="stat-value">{analytics.active_users}</div>
                  <div className="stat-label">Active Users</div>
                </div>
                <div className="stat-card" style={{ background: 'var(--success-light)' }} data-testid="stat-total-users">
                  <div className="stat-value">{analytics.total_users}</div>
                  <div className="stat-label">Total Users</div>
                </div>
                <div className="stat-card" style={{ background: 'var(--warning-light)' }} data-testid="stat-ai-interactions">
                  <div className="stat-value">{analytics.ai_interactions}</div>
                  <div className="stat-label">AI Interactions</div>
                </div>
              </div>
              <div data-testid="feature-adoption">
                <h4 className="mb-2">Feature Adoption</h4>
                {Object.entries(analytics.feature_adoption).map(([feature, rate]) => (
                  <div key={feature} className="mb-2">
                    <div className="text-sm mb-1">{feature}: {rate}%</div>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${rate}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
