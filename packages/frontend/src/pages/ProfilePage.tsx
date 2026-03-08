import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LanguageSelector } from '../components/LanguageSelector';
import { ThemeToggle } from '../components/ThemeToggle';
import { useTheme } from '../contexts/ThemeContext';

function getUserInfo() {
  try {
    const token = localStorage.getItem('krishimitra_token');
    if (!token) return { name: 'Farmer', phone: '' };
    const payload = JSON.parse(atob(token.split('.')[1]));
    return { name: payload.name || 'Farmer', phone: payload.phone || '' };
  } catch { /* token parse error */ }
  return { name: 'Farmer', phone: '' };
}

export function ProfilePage() {
  const user = getUserInfo();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const [priceAlerts, setPriceAlerts] = useState(true);
  const [weatherAlerts, setWeatherAlerts] = useState(true);
  const [cropAdvisories, setCropAdvisories] = useState(true);

  const initial = (user.name || 'F').charAt(0).toUpperCase();

  return (
    <div className="page-container fade-in">
      <div className="profile-header">
        <div className="profile-avatar">{initial}</div>
        <div>
          <div className="profile-name">{user.name}</div>
          <div className="profile-phone">{user.phone || 'No phone on file'}</div>
        </div>
      </div>

      <div className="form-section mb-4">
        <div className="form-section-title">👤 Account Information</div>
        <div className="settings-row">
          <div>
            <div className="settings-label">Name</div>
            <div className="settings-desc">{user.name}</div>
          </div>
        </div>
        <div className="settings-row">
          <div>
            <div className="settings-label">Phone</div>
            <div className="settings-desc">{user.phone || 'Not set'}</div>
          </div>
        </div>
      </div>

      <div className="form-section mb-4">
        <div className="form-section-title">🎨 Preferences</div>
        <div className="settings-row">
          <div>
            <div className="settings-label">Language</div>
            <div className="settings-desc">Choose your preferred language</div>
          </div>
          <LanguageSelector />
        </div>
        <div className="settings-row">
          <div>
            <div className="settings-label">Theme</div>
            <div className="settings-desc">Currently using {theme} mode</div>
          </div>
          <ThemeToggle />
        </div>
      </div>

      <div className="form-section mb-4">
        <div className="form-section-title">🔔 Notifications</div>
        <div className="settings-row">
          <div>
            <div className="settings-label">Price Alerts</div>
            <div className="settings-desc">Get notified about price changes</div>
          </div>
          <button
            className={`toggle-switch ${priceAlerts ? 'active' : ''}`}
            onClick={() => setPriceAlerts((v) => !v)}
            aria-label="Toggle price alerts"
          />
        </div>
        <div className="settings-row">
          <div>
            <div className="settings-label">Weather Alerts</div>
            <div className="settings-desc">Severe weather notifications</div>
          </div>
          <button
            className={`toggle-switch ${weatherAlerts ? 'active' : ''}`}
            onClick={() => setWeatherAlerts((v) => !v)}
            aria-label="Toggle weather alerts"
          />
        </div>
        <div className="settings-row">
          <div>
            <div className="settings-label">Crop Advisories</div>
            <div className="settings-desc">AI-powered crop recommendations</div>
          </div>
          <button
            className={`toggle-switch ${cropAdvisories ? 'active' : ''}`}
            onClick={() => setCropAdvisories((v) => !v)}
            aria-label="Toggle crop advisories"
          />
        </div>
      </div>

      <div className="form-section">
        <div className="form-section-title">ℹ️ About</div>
        <div className="settings-row">
          <div>
            <div className="settings-label">App Version</div>
            <div className="settings-desc">KrishiMitra v1.0.0</div>
          </div>
        </div>
        <div className="settings-row">
          <div>
            <div className="settings-label">Onboarding Tour</div>
            <div className="settings-desc">Revisit the app walkthrough</div>
          </div>
          <button className="btn btn-sm btn-secondary" onClick={() => navigate('/onboarding')}>
            Start Tour
          </button>
        </div>
      </div>
    </div>
  );
}
