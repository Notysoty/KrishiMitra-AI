import React, { useState, useEffect, useCallback } from 'react';
import {
  listGroups, createGroup, getGroupMembers, addGroupMember, broadcastMessage,
  getBroadcastTracking, getGroupAnalytics, exportGroupData,
  FarmerGroup, GroupMember, BroadcastMessage, GroupAnalytics,
} from '../services/adminClient';
import { useTranslation } from '../i18n';

export const GroupManagementPage: React.FC = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<FarmerGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<FarmerGroup | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [analytics, setAnalytics] = useState<GroupAnalytics | null>(null);
  const [lastBroadcast, setLastBroadcast] = useState<BroadcastMessage | null>(null);

  const [newGroupForm, setNewGroupForm] = useState({ name: '', description: '' });
  const [addMemberPhone, setAddMemberPhone] = useState('');
  const [broadcastContent, setBroadcastContent] = useState('');
  const [collectiveCrop, setCollectiveCrop] = useState('');
  const [collectiveVolume, setCollectiveVolume] = useState('');
  const [collectivePrice, setCollectivePrice] = useState<{ market: string; price: number } | null>(null);
  const [suggestingBroadcast, setSuggestingBroadcast] = useState(false);

  const loadGroups = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listGroups();
      setGroups(data.items);
    } catch { setError('Failed to load groups.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadGroups(); }, [loadGroups]);

  const handleSelectGroup = async (group: FarmerGroup) => {
    setSelectedGroup(group);
    setLoading(true);
    try {
      const [m, a] = await Promise.all([getGroupMembers(group.id), getGroupAnalytics(group.id)]);
      setMembers(m);
      setAnalytics(a);
    } catch { setError('Failed to load group details.'); }
    finally { setLoading(false); }
  };

  const handleCreateGroup = async () => {
    if (!newGroupForm.name) return;
    setLoading(true);
    try {
      const group = await createGroup(newGroupForm.name, newGroupForm.description || undefined);
      setGroups(prev => [...prev, group]);
      setNewGroupForm({ name: '', description: '' });
    } catch { setError('Failed to create group.'); }
    finally { setLoading(false); }
  };

  const handleAddMember = async () => {
    if (!selectedGroup || !addMemberPhone) return;
    setLoading(true);
    try {
      const member = await addGroupMember(selectedGroup.id, addMemberPhone);
      setMembers(prev => [...prev, member]);
      setAddMemberPhone('');
    } catch { setError('Failed to add member.'); }
    finally { setLoading(false); }
  };

  const handleBroadcast = async () => {
    if (!selectedGroup || !broadcastContent) return;
    setLoading(true);
    try {
      const broadcast = await broadcastMessage(selectedGroup.id, broadcastContent);
      setLastBroadcast(broadcast);
      setBroadcastContent('');
    } catch { setError('Failed to send broadcast.'); }
    finally { setLoading(false); }
  };

  const handleCollectivePricing = async () => {
    if (!collectiveCrop) return;
    setLoading(true);
    try {
      const { getToken } = await import('../services/authClient');
      const token = getToken();
      const BASE_URL = process.env.REACT_APP_API_URL ?? 'http://localhost:3000';
      const res = await fetch(`${BASE_URL}/api/v1/markets/prices?crop=${encodeURIComponent(collectiveCrop)}`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (res.ok) {
        const data = await res.json() as { prices: { market: string; price_per_kg: number }[] };
        const best = data.prices.sort((a, b) => b.price_per_kg - a.price_per_kg)[0];
        if (best) setCollectivePrice({ market: best.market, price: best.price_per_kg });
      }
    } catch { setError('Failed to fetch market price.'); }
    finally { setLoading(false); }
  };

  const handleSuggestBroadcast = async () => {
    if (!selectedGroup) return;
    setSuggestingBroadcast(true);
    try {
      const { sendMessage } = await import('../services/apiClient');
      const prompt = `I am a field officer for "${selectedGroup.name}" farmer group with ${selectedGroup.member_count} members. Write a brief, practical WhatsApp broadcast message (max 100 words) about current seasonal farming tips or market opportunities. Keep it in simple Hindi/English.`;
      const result = await sendMessage(prompt, 'en');
      setBroadcastContent(result.text.trim());
    } catch { setError('AI suggestion failed. Please try again.'); }
    finally { setSuggestingBroadcast(false); }
  };

  const handleExport = async () => {
    if (!selectedGroup) return;
    try {
      const data = await exportGroupData(selectedGroup.id);
      const blob = new Blob([data.csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selectedGroup.name}-export.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { setError('Failed to export data.'); }
  };

  return (
    <div className="page-container fade-in" data-testid="group-management-page">
      <div className="section-header-light">👥 {t('groupManagement')}</div>

      {loading && <div data-testid="loading-indicator" className="p-4"><div className="skeleton-heading mb-3" /><div className="skeleton-line" /><div className="skeleton-line medium" /><div className="skeleton-line short" /></div>}
      {error && <div data-testid="error-message" role="alert" className="alert-box alert-error">{error}</div>}

      <div className="mt-4">
        <div className="form-section">
          <div className="form-section-title">Create Group</div>
          <div className="form-row mb-3">
            <div className="form-group">
              <input className="form-input" placeholder="Group Name" value={newGroupForm.name} onChange={e => setNewGroupForm(f => ({ ...f, name: e.target.value }))} data-testid="group-name-input" />
            </div>
            <div className="form-group">
              <input className="form-input" placeholder="Description" value={newGroupForm.description} onChange={e => setNewGroupForm(f => ({ ...f, description: e.target.value }))} data-testid="group-desc-input" />
            </div>
          </div>
          <button className="btn btn-primary" onClick={handleCreateGroup} data-testid="create-group-btn">Create</button>
        </div>

        <div data-testid="groups-list">
          <h3 className="mb-3">Groups</h3>
          {groups.map(g => (
            <div key={g.id} data-testid={`group-${g.id}`} onClick={() => handleSelectGroup(g)}
              className={`card mb-2 ${selectedGroup?.id === g.id ? '' : ''}`}
              style={{ cursor: 'pointer', borderColor: selectedGroup?.id === g.id ? 'var(--primary)' : undefined, background: selectedGroup?.id === g.id ? 'var(--primary-50)' : undefined }}>
              <div className="card-body">
                <div className="font-semibold">{g.name}</div>
                <div className="text-xs text-muted">{g.member_count} members{g.description ? ` • ${g.description}` : ''}</div>
              </div>
            </div>
          ))}
        </div>

        {selectedGroup && (
          <div data-testid="group-details" className="mt-4">
            <h3 className="mb-3">{selectedGroup.name}</h3>

            {analytics && (
              <div className="stat-grid mb-4" data-testid="group-analytics">
                <div className="stat-card" style={{ background: 'var(--primary-50)' }}>
                  <div className="stat-value">{analytics.member_count}</div>
                  <div className="stat-label">Members</div>
                </div>
                <div className="stat-card" style={{ background: 'var(--success-light)' }}>
                  <div className="stat-value">{analytics.active_members}</div>
                  <div className="stat-label">Active</div>
                </div>
                <div className="stat-card" style={{ background: 'var(--accent-light)' }}>
                  <div className="stat-value">{(analytics.avg_view_rate * 100).toFixed(0)}%</div>
                  <div className="stat-label">View Rate</div>
                </div>
                <div className="stat-card" style={{ background: 'var(--warning-light)' }}>
                  <div className="stat-value">{analytics.messages_sent}</div>
                  <div className="stat-label">Messages</div>
                </div>
              </div>
            )}

            <div className="form-section">
              <div className="form-section-title">Add Member</div>
              <div className="flex gap-2 items-center">
                <input className="form-input" placeholder="Phone number" value={addMemberPhone} onChange={e => setAddMemberPhone(e.target.value)} data-testid="add-member-phone" style={{ flex: 1 }} />
                <button className="btn btn-primary" onClick={handleAddMember} data-testid="add-member-btn">Add</button>
              </div>
            </div>

            <div data-testid="members-list" className="card mb-4">
              <div className="card-header">Members ({members.length})</div>
              {members.map(m => (
                <div key={m.user_id} data-testid={`member-${m.user_id}`} className="text-sm" style={{ padding: '10px 14px', borderBottom: '1px solid var(--gray-100)' }}>
                  {m.name} — {m.phone}
                </div>
              ))}
            </div>

            <div className="form-section">
              <div className="form-section-title">🌾 Collective Crop Pricing</div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                Aggregate your group&apos;s crop volumes to negotiate better prices at the mandi.
              </p>
              <div className="flex gap-2 items-center" style={{ flexWrap: 'wrap', gap: '0.5rem', display: 'flex' }}>
                <input
                  className="form-input"
                  placeholder="Crop (e.g. Tomato)"
                  value={collectiveCrop}
                  onChange={e => setCollectiveCrop(e.target.value)}
                  style={{ flex: 1, minWidth: 140 }}
                />
                <input
                  className="form-input"
                  placeholder="Total volume (kg)"
                  type="number"
                  value={collectiveVolume}
                  onChange={e => setCollectiveVolume(e.target.value)}
                  style={{ flex: 1, minWidth: 120 }}
                />
                <button className="btn btn-accent" onClick={handleCollectivePricing}>
                  Check Best Price
                </button>
              </div>
              {collectivePrice && (
                <div className="alert-box alert-success mt-3" style={{ marginTop: '0.75rem' }}>
                  <strong>Best market:</strong> {collectivePrice.market} — ₹{collectivePrice.price}/kg
                  {collectiveVolume && (
                    <div>
                      <strong>Estimated group revenue:</strong> ₹{(parseFloat(collectiveVolume) * collectivePrice.price).toLocaleString('en-IN')}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="form-section">
              <div className="form-section-title">📢 Broadcast Message</div>
              <div className="form-group">
                <textarea className="form-input" placeholder="Message content" value={broadcastContent} onChange={e => setBroadcastContent(e.target.value)} data-testid="broadcast-input" style={{ minHeight: 80 }} />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button className="btn btn-primary" onClick={handleBroadcast} data-testid="send-broadcast-btn">📤 Send Broadcast</button>
                <button
                  className={`btn btn-ghost ${suggestingBroadcast ? 'btn-loading' : ''}`}
                  onClick={handleSuggestBroadcast}
                  disabled={suggestingBroadcast}
                  title="Let AI suggest a seasonal farming broadcast message"
                >
                  {suggestingBroadcast ? <><span className="btn-spinner" /> Generating...</> : '✨ AI Suggest'}
                </button>
              </div>
            </div>

            {lastBroadcast && (
              <div data-testid="broadcast-tracking" className="alert-box alert-success mb-4">
                <div>
                  <div className="font-semibold">Last Broadcast</div>
                  <div className="text-sm">Delivered: {lastBroadcast.delivered}/{lastBroadcast.total} | Viewed: {lastBroadcast.viewed}/{lastBroadcast.total}</div>
                </div>
              </div>
            )}

            <button className="btn btn-accent" onClick={handleExport} data-testid="export-group-btn">Export Group Data (CSV)</button>
          </div>
        )}
      </div>
    </div>
  );
};
