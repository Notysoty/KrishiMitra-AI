import React, { useState, useEffect, useCallback } from 'react';
import {
  listGroups, createGroup, getGroupMembers, addGroupMember, broadcastMessage,
  getBroadcastTracking, getGroupAnalytics, exportGroupData,
  FarmerGroup, GroupMember, BroadcastMessage, GroupAnalytics,
} from '../services/adminClient';

export const GroupManagementPage: React.FC = () => {
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

  const containerStyle: React.CSSProperties = { maxWidth: 800, margin: '0 auto', fontFamily: 'sans-serif' };
  const headerStyle: React.CSSProperties = { padding: '12px 16px', backgroundColor: '#00695c', color: '#fff', fontWeight: 600, fontSize: 18 };
  const inputStyle: React.CSSProperties = { padding: '6px 10px', border: '1px solid #ccc', borderRadius: 4, fontSize: 14, marginRight: 8 };
  const btnStyle: React.CSSProperties = { padding: '6px 16px', backgroundColor: '#00695c', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 14 };

  return (
    <div style={containerStyle} data-testid="group-management-page">
      <div style={headerStyle}>Field Officer Group Management</div>

      {loading && <div data-testid="loading-indicator" style={{ padding: 24, textAlign: 'center', color: '#666' }}>Loading...</div>}
      {error && <div data-testid="error-message" role="alert" style={{ padding: '8px 16px', backgroundColor: '#ffebee', color: '#c62828', fontSize: 13 }}>{error}</div>}

      <div style={{ padding: 16 }}>
        <div style={{ marginBottom: 16, padding: 12, backgroundColor: '#f5f5f5', borderRadius: 8 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Create Group</div>
          <input style={inputStyle} placeholder="Group Name" value={newGroupForm.name} onChange={e => setNewGroupForm(f => ({ ...f, name: e.target.value }))} data-testid="group-name-input" />
          <input style={inputStyle} placeholder="Description" value={newGroupForm.description} onChange={e => setNewGroupForm(f => ({ ...f, description: e.target.value }))} data-testid="group-desc-input" />
          <button style={btnStyle} onClick={handleCreateGroup} data-testid="create-group-btn">Create</button>
        </div>

        <div data-testid="groups-list">
          <h3>Groups</h3>
          {groups.map(g => (
            <div key={g.id} data-testid={`group-${g.id}`} onClick={() => handleSelectGroup(g)}
              style={{ padding: 12, marginBottom: 8, backgroundColor: selectedGroup?.id === g.id ? '#e0f2f1' : '#fafafa', borderRadius: 8, cursor: 'pointer', border: '1px solid #e0e0e0' }}>
              <div style={{ fontWeight: 600 }}>{g.name}</div>
              <div style={{ fontSize: 12, color: '#666' }}>{g.member_count} members{g.description ? ` • ${g.description}` : ''}</div>
            </div>
          ))}
        </div>

        {selectedGroup && (
          <div data-testid="group-details" style={{ marginTop: 16 }}>
            <h3>{selectedGroup.name}</h3>

            {analytics && (
              <div data-testid="group-analytics" style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                <div style={{ flex: 1, padding: 8, backgroundColor: '#e0f2f1', borderRadius: 8, textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{analytics.member_count}</div>
                  <div style={{ fontSize: 11 }}>Members</div>
                </div>
                <div style={{ flex: 1, padding: 8, backgroundColor: '#e8f5e9', borderRadius: 8, textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{analytics.active_members}</div>
                  <div style={{ fontSize: 11 }}>Active</div>
                </div>
                <div style={{ flex: 1, padding: 8, backgroundColor: '#e3f2fd', borderRadius: 8, textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{(analytics.avg_view_rate * 100).toFixed(0)}%</div>
                  <div style={{ fontSize: 11 }}>View Rate</div>
                </div>
                <div style={{ flex: 1, padding: 8, backgroundColor: '#fff3e0', borderRadius: 8, textAlign: 'center' }}>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{analytics.messages_sent}</div>
                  <div style={{ fontSize: 11 }}>Messages</div>
                </div>
              </div>
            )}

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Add Member</div>
              <input style={inputStyle} placeholder="Phone number" value={addMemberPhone} onChange={e => setAddMemberPhone(e.target.value)} data-testid="add-member-phone" />
              <button style={btnStyle} onClick={handleAddMember} data-testid="add-member-btn">Add</button>
            </div>

            <div data-testid="members-list" style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Members ({members.length})</div>
              {members.map(m => (
                <div key={m.user_id} data-testid={`member-${m.user_id}`} style={{ padding: 8, borderBottom: '1px solid #eee', fontSize: 13 }}>
                  {m.name} — {m.phone}
                </div>
              ))}
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Broadcast Message</div>
              <textarea style={{ ...inputStyle, width: '100%', minHeight: 60 }} placeholder="Message content" value={broadcastContent} onChange={e => setBroadcastContent(e.target.value)} data-testid="broadcast-input" />
              <button style={btnStyle} onClick={handleBroadcast} data-testid="send-broadcast-btn">Send Broadcast</button>
            </div>

            {lastBroadcast && (
              <div data-testid="broadcast-tracking" style={{ padding: 12, backgroundColor: '#e8f5e9', borderRadius: 8, marginBottom: 16 }}>
                <div style={{ fontWeight: 600 }}>Last Broadcast</div>
                <div style={{ fontSize: 13 }}>Delivered: {lastBroadcast.delivered}/{lastBroadcast.total} | Viewed: {lastBroadcast.viewed}/{lastBroadcast.total}</div>
              </div>
            )}

            <button style={btnStyle} onClick={handleExport} data-testid="export-group-btn">Export Group Data (CSV)</button>
          </div>
        )}
      </div>
    </div>
  );
};
