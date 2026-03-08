import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

interface CommandItem {
  path: string;
  label: string;
  icon: string;
  desc: string;
}

const COMMANDS: CommandItem[] = [
  { path: '/chat', label: 'AI Chat', icon: '💬', desc: 'Ask farming questions' },
  { path: '/farm-profile', label: 'Farm Profile', icon: '🏡', desc: 'Manage your farm' },
  { path: '/market', label: 'Market Intelligence', icon: '📊', desc: 'Prices and forecasts' },
  { path: '/sustainability', label: 'Sustainability', icon: '🌱', desc: 'Water and climate' },
  { path: '/groups', label: 'Groups', icon: '👥', desc: 'Farmer groups' },
  { path: '/profile', label: 'Profile & Settings', icon: '👤', desc: 'Account preferences' },
  { path: '/admin', label: 'Admin', icon: '⚙️', desc: 'Tenant management' },
  { path: '/analytics', label: 'Analytics', icon: '📈', desc: 'Usage statistics' },
  { path: '/audit-log', label: 'Audit Log', icon: '📋', desc: 'Activity history' },
  { path: '/moderation', label: 'Moderation', icon: '🛡️', desc: 'Content review' },
  { path: '/platform-admin', label: 'Platform Admin', icon: '🔧', desc: 'System settings' },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function CommandPalette({ isOpen, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const filtered = COMMANDS.filter(
    (cmd) =>
      cmd.label.toLowerCase().includes(query.toLowerCase()) ||
      cmd.desc.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleSelect = useCallback(
    (item: CommandItem) => {
      navigate(item.path);
      onClose();
    },
    [navigate, onClose]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' && filtered[selectedIndex]) {
        e.preventDefault();
        handleSelect(filtered[selectedIndex]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    },
    [filtered, selectedIndex, handleSelect, onClose]
  );

  if (!isOpen) return null;

  return (
    <div className="cmd-overlay" onClick={onClose}>
      <div className="cmd-palette" onClick={(e) => e.stopPropagation()}>
        <div className="cmd-input-wrap">
          <span className="cmd-input-icon">🔍</span>
          <input
            ref={inputRef}
            className="cmd-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search pages..."
          />
        </div>
        <div className="cmd-results">
          {filtered.length === 0 ? (
            <div className="cmd-empty">No results found</div>
          ) : (
            filtered.map((item, i) => (
              <div
                key={item.path}
                className={`cmd-result-item ${i === selectedIndex ? 'selected' : ''}`}
                onClick={() => handleSelect(item)}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                <span className="cmd-result-icon">{item.icon}</span>
                <span className="cmd-result-label">{item.label}</span>
                <span className="cmd-result-desc">{item.desc}</span>
              </div>
            ))
          )}
        </div>
        <div className="cmd-footer">
          <span><span className="cmd-kbd">↑↓</span> navigate</span>
          <span><span className="cmd-kbd">↵</span> select</span>
          <span><span className="cmd-kbd">esc</span> close</span>
        </div>
      </div>
    </div>
  );
}
