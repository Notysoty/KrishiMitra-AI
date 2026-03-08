import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LanguageSelector } from '../components/LanguageSelector';
import { ThemeToggle } from '../components/ThemeToggle';
import { useTheme } from '../contexts/ThemeContext';
import { useTranslation } from '../i18n';

function getUserInfo() {
  try {
    const token = localStorage.getItem('krishimitra_token');
    if (!token) return { name: '', phone: '' };
    const payload = JSON.parse(atob(token.split('.')[1]));
    return { name: payload.name || '', phone: payload.phone || '' };
  } catch { /* token parse error */ }
  return { name: '', phone: '' };
}

export function ProfilePage() {
  const { t } = useTranslation();
  const user = getUserInfo();
  const displayName = user.name || t('farmer');
  const navigate = useNavigate();
  const { theme } = useTheme();
  const [priceAlerts, setPriceAlerts] = useState(true);
  const [weatherAlerts, setWeatherAlerts] = useState(true);
  const [cropAdvisories, setCropAdvisories] = useState(true);

  const initial = displayName.charAt(0).toUpperCase();

  return (
    <div className="page-container fade-in">
      <div className="profile-header">
        <div className="profile-avatar">{initial}</div>
        <div>
          <div className="profile-name">{displayName}</div>
          <div className="profile-phone">{user.phone || t('noPhoneOnFile')}</div>
        </div>
      </div>

      <div className="form-section mb-4">
        <div className="form-section-title">👤 {t('accountInfo')}</div>
        <div className="settings-row">
          <div>
            <div className="settings-label">{t('name')}</div>
            <div className="settings-desc">{displayName}</div>
          </div>
        </div>
        <div className="settings-row">
          <div>
            <div className="settings-label">{t('phone')}</div>
            <div className="settings-desc">{user.phone || t('notSet')}</div>
          </div>
        </div>
      </div>

      <div className="form-section mb-4">
        <div className="form-section-title">🎨 {t('preferences')}</div>
        <div className="settings-row">
          <div>
            <div className="settings-label">{t('language')}</div>
            <div className="settings-desc">{t('chooseLanguage')}</div>
          </div>
          <LanguageSelector />
        </div>
        <div className="settings-row">
          <div>
            <div className="settings-label">{t('theme')}</div>
            <div className="settings-desc">{t('currentlyUsing')} {theme} {t('modeLabel')}</div>
          </div>
          <ThemeToggle />
        </div>
      </div>

      <div className="form-section mb-4">
        <div className="form-section-title">🔔 {t('notifications')}</div>
        <div className="settings-row">
          <div>
            <div className="settings-label">{t('priceAlertsLabel')}</div>
            <div className="settings-desc">{t('priceAlertsDesc')}</div>
          </div>
          <button
            className={`toggle-switch ${priceAlerts ? 'active' : ''}`}
            onClick={() => setPriceAlerts((v) => !v)}
            aria-label="Toggle price alerts"
          />
        </div>
        <div className="settings-row">
          <div>
            <div className="settings-label">{t('weatherAlertsLabel')}</div>
            <div className="settings-desc">{t('weatherAlertsDesc')}</div>
          </div>
          <button
            className={`toggle-switch ${weatherAlerts ? 'active' : ''}`}
            onClick={() => setWeatherAlerts((v) => !v)}
            aria-label="Toggle weather alerts"
          />
        </div>
        <div className="settings-row">
          <div>
            <div className="settings-label">{t('cropAdvisories')}</div>
            <div className="settings-desc">{t('cropAdvisoriesDesc')}</div>
          </div>
          <button
            className={`toggle-switch ${cropAdvisories ? 'active' : ''}`}
            onClick={() => setCropAdvisories((v) => !v)}
            aria-label="Toggle crop advisories"
          />
        </div>
      </div>

      <div className="form-section">
        <div className="form-section-title">ℹ️ {t('about')}</div>
        <div className="settings-row">
          <div>
            <div className="settings-label">{t('appVersion')}</div>
            <div className="settings-desc">KrishiMitra v1.0.0</div>
          </div>
        </div>
        <div className="settings-row">
          <div>
            <div className="settings-label">{t('onboardingTour')}</div>
            <div className="settings-desc">{t('onboardingTourDesc')}</div>
          </div>
          <button className="btn btn-sm btn-secondary" onClick={() => navigate('/onboarding')}>
            {t('startTour')}
          </button>
        </div>
      </div>
    </div>
  );
}
