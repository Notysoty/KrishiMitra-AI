import React, { useState, useEffect, useCallback } from 'react';
import {
  getBranding, updateBranding, listUsers, addUser, removeUser, bulkImportUsers,
  updateRegionalPreferences, getPendingContent, reviewContent, getUsageAnalytics,
  BrandingConfig, TenantUser, PendingContent, UsageAnalytics, RegionalPreferences, BulkImportResult,
} from '../services/adminClient';

type Tab = 'branding' | 'users' | 'regional' | 'content' | 'analytics';

export const TenantAdminPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('branding');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Branding state
  const [branding, setBranding] = useState<BrandingConfig | null>(null);
  const [brandingForm, setBrandingForm] = useState({ org_name: '', primary_color: '', secondary_color: '', logo_url: '' });

  // Users state
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [newUserForm, setNewUserForm] = useState({ phone: '', name: '', roles: 'Farmer' });
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<BulkImportResult | null>(null);

  // Regional state
  const [regional, setRegional] = useState<RegionalPreferences | null>(null);

  // Content state
  const [pendingContent, setPendingContent] = useState<PendingContent[]>([]);

  // Analytics state
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
    { key: 'branding', label: 'Branding' },
    { key: 'users', label: 'Users' },
    { key: 'regional', label: 'Regional' },
    { key: 'content', label: 'Content' },
    { key: 'analytics', label: 'Analytics' },
  ];

  const containerStyle: React.CSSProperties = { maxWidth: 800, margin: '0 auto', fontFamily: 'sans-serif' };
  const headerStyle: React.CSSProperties = { padding: '12px 16px', backgroundColor: '#1565c0', color: '#fff', fontWeight: 600, fontSize: 18 };
  const tabBarStyle: React.CSSProperties = { display: 'flex', borderBottom: '2px solid #e0e0e0', backgroundColor: '#fff' };
  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '10px 0', textAlign: 'center', cursor: 'pointer', fontWeight: active ? 700 : 400,
    color: active ? '#1565c0' : '#666', border: 'none', borderBottom: active ? '3px solid #1565c0' : '3px solid transparent', backgroundColor: 'transparent', fontSize: 14,
  });
  const sectionStyle: React.CSSProperties = { padding: 16 };
  const inputStyle: React.CSSProperties = { padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4, fontSize: 14, marginRight: 8 };
  const btnStyle: React.CSSProperties = { padding: '6px 16px', backgroundColor: '#1565c0', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 14 };
  const dangerBtnStyle: React.CSSProperties = { ...btnStyle, backgroundColor: '#c62828' };

  return (
    <div style={containerStyle} data-testid="tenant-admin-page">
      <div style={headerStyle}>Tenant Administration</div>
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
          {activeTab === 'branding' && branding && (
            <div style={sectionStyle} data-testid="branding-section">
              <h3>Organization Branding</h3>
              <div style={{ marginBottom: 12 }}>
                <label>Organization Name<br />
                  <input style={inputStyle} value={brandingForm.org_name} onChange={e => setBrandingForm(f => ({ ...f, org_name: e.target.value }))} data-testid="branding-org-name" />
                </label>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label>Primary Color<br />
                  <input style={inputStyle} type="color" value={brandingForm.primary_color} onChange={e => setBrandingForm(f => ({ ...f, primary_color: e.target.value }))} data-testid="branding-primary-color" />
                </label>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label>Logo URL<br />
                  <input style={inputStyle} value={brandingForm.logo_url} onChange={e => setBrandingForm(f => ({ ...f, logo_url: e.target.value }))} data-testid="branding-logo-url" />
                </label>
              </div>
              <button style={btnStyle} onClick={handleSaveBranding} data-testid="save-branding-btn">Save Branding</button>
            </div>
          )}

          {activeTab === 'users' && (
            <div style={sectionStyle} data-testid="users-section">
              <h3>User Management</h3>
              <div style={{ marginBottom: 16, padding: 12, backgroundColor: '#f5f5f5', borderRadius: 8 }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>Add User</div>
                <input style={inputStyle} placeholder="Phone" value={newUserForm.phone} onChange={e => setNewUserForm(f => ({ ...f, phone: e.target.value }))} data-testid="add-user-phone" />
                <input style={inputStyle} placeholder="Name" value={newUserForm.name} onChange={e => setNewUserForm(f => ({ ...f, name: e.target.value }))} data-testid="add-user-name" />
                <select style={inputStyle} value={newUserForm.roles} onChange={e => setNewUserForm(f => ({ ...f, roles: e.target.value }))} data-testid="add-user-role">
                  <option value="Farmer">Farmer</option>
                  <option value="Field_Officer">Field Officer</option>
                  <option value="Agronomist">Agronomist</option>
                  <option value="Buyer">Buyer</option>
                </select>
                <button style={btnStyle} onClick={handleAddUser} data-testid="add-user-btn">Add</button>
              </div>
              <div style={{ marginBottom: 16, padding: 12, backgroundColor: '#f5f5f5', borderRadius: 8 }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>Bulk CSV Import</div>
                <input type="file" accept=".csv" onChange={e => setCsvFile(e.target.files?.[0] || null)} data-testid="csv-file-input" />
                <button style={btnStyle} onClick={handleBulkImport} disabled={!csvFile} data-testid="bulk-import-btn">Import</button>
                {importResult && <div data-testid="import-result" style={{ marginTop: 8, fontSize: 13 }}>Imported: {importResult.imported}, Failed: {importResult.failed}</div>}
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }} data-testid="users-table">
                <thead>
                  <tr style={{ borderBottom: '2px solid #e0e0e0', textAlign: 'left' }}>
                    <th style={{ padding: 8 }}>Name</th><th style={{ padding: 8 }}>Phone</th><th style={{ padding: 8 }}>Roles</th><th style={{ padding: 8 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id} data-testid={`user-row-${u.id}`} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: 8 }}>{u.name}</td>
                      <td style={{ padding: 8 }}>{u.phone}</td>
                      <td style={{ padding: 8 }}>{u.roles.join(', ')}</td>
                      <td style={{ padding: 8 }}><button style={dangerBtnStyle} onClick={() => handleRemoveUser(u.id)} data-testid={`remove-user-${u.id}`}>Remove</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'regional' && regional && (
            <div style={sectionStyle} data-testid="regional-section">
              <h3>Regional Preferences</h3>
              <div style={{ marginBottom: 8 }}><strong>Languages:</strong> {regional.supported_languages.join(', ')}</div>
              <div style={{ marginBottom: 8 }}><strong>Crops:</strong> {regional.supported_crops.join(', ')}</div>
              <div style={{ marginBottom: 8 }}><strong>Markets:</strong> {regional.supported_markets.join(', ')}</div>
              <div><strong>Default Region:</strong> {regional.default_region}</div>
            </div>
          )}

          {activeTab === 'content' && (
            <div style={sectionStyle} data-testid="content-section">
              <h3>Content Approval</h3>
              {pendingContent.length === 0 && <div data-testid="no-pending-content">No pending content for review.</div>}
              {pendingContent.map(item => (
                <div key={item.id} data-testid={`content-item-${item.id}`} style={{ padding: 12, marginBottom: 12, backgroundColor: '#f5f5f5', borderRadius: 8 }}>
                  <div style={{ fontWeight: 600 }}>{item.title}</div>
                  <div style={{ fontSize: 13, color: '#555', margin: '4px 0' }}>{item.content_snapshot}</div>
                  <div style={{ fontSize: 12, color: '#888' }}>Confidence: {(item.confidence_score * 100).toFixed(0)}% | Sources: {item.sources.join(', ')}</div>
                  <div style={{ marginTop: 8 }}>
                    <button style={btnStyle} onClick={() => handleReviewContent(item.article_id, 'approve')} data-testid={`approve-${item.id}`}>Approve</button>
                    <button style={{ ...dangerBtnStyle, marginLeft: 8 }} onClick={() => handleReviewContent(item.article_id, 'reject')} data-testid={`reject-${item.id}`}>Reject</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'analytics' && analytics && (
            <div style={sectionStyle} data-testid="analytics-section">
              <h3>Usage Analytics</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div data-testid="stat-active-users" style={{ padding: 12, backgroundColor: '#e3f2fd', borderRadius: 8, textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 700 }}>{analytics.active_users}</div>
                  <div style={{ fontSize: 12, color: '#666' }}>Active Users</div>
                </div>
                <div data-testid="stat-total-users" style={{ padding: 12, backgroundColor: '#e8f5e9', borderRadius: 8, textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 700 }}>{analytics.total_users}</div>
                  <div style={{ fontSize: 12, color: '#666' }}>Total Users</div>
                </div>
                <div data-testid="stat-ai-interactions" style={{ padding: 12, backgroundColor: '#fff3e0', borderRadius: 8, textAlign: 'center' }}>
                  <div style={{ fontSize: 24, fontWeight: 700 }}>{analytics.ai_interactions}</div>
                  <div style={{ fontSize: 12, color: '#666' }}>AI Interactions</div>
                </div>
              </div>
              <div data-testid="feature-adoption">
                <h4>Feature Adoption</h4>
                {Object.entries(analytics.feature_adoption).map(([feature, rate]) => (
                  <div key={feature} style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 13 }}>{feature}: {rate}%</div>
                    <div style={{ height: 8, backgroundColor: '#e0e0e0', borderRadius: 4 }}>
                      <div style={{ height: '100%', width: `${rate}%`, backgroundColor: '#1565c0', borderRadius: 4 }} />
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
