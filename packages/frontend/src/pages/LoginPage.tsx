import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTranslation } from '../i18n';
import { isBiometricAvailable } from '../services/authClient';
import { useToast } from '../contexts/ToastContext';

const HERO_FEATURES = [
  { icon: '🌾', title: 'AI Crop Advice', desc: 'Get personalized guidance for your crops' },
  { icon: '📊', title: 'Live Market Prices', desc: 'Track mandi rates across India in real time' },
  { icon: '🦠', title: 'Disease Detection', desc: 'Identify crop diseases from a photo' },
  { icon: '🌧️', title: 'Weather Alerts', desc: 'Hyperlocal forecasts and pest warnings' },
];

export function LoginPage() {
  const { login, verifyOtp, loading, error } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const biometricAvailable = isBiometricAvailable();
  const prevError = useRef<string | null>(null);
  const otpRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (error && error !== prevError.current) {
      showToast(error, 'error');
    }
    prevError.current = error;
  }, [error, showToast]);

  useEffect(() => {
    if (otpSent) otpRef.current?.focus();
  }, [otpSent]);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await login(phone);
    if (result.success) {
      setOtpSent(true);
      showToast(t('otpSentSuccess'), 'success');
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await verifyOtp(phone, otp);
    if (result.success) {
      const onboardingDone = localStorage.getItem('krishimitra_onboarding_complete') === 'true';
      navigate(onboardingDone ? '/' : '/onboarding');
    }
  };

  return (
    <div className="auth-layout">
      {/* Hero panel — visible on desktop */}
      <div className="auth-hero">
        <div className="auth-hero-inner">
          <div className="auth-hero-logo">
            <img src="/logo.svg" alt="KrishiMitra" width={44} height={44} />
            <span className="auth-hero-brand">KrishiMitra</span>
          </div>
          <h2 className="auth-hero-title">Smart farming,<br />powered by AI</h2>
          <p className="auth-hero-subtitle">
            Your pocket advisor for market prices, crop health, weather alerts, and government schemes — in your language.
          </p>
          <ul className="auth-hero-features">
            {HERO_FEATURES.map(f => (
              <li key={f.title} className="auth-hero-feature">
                <span className="auth-hero-feature-icon">{f.icon}</span>
                <div>
                  <div className="auth-hero-feature-title">{f.title}</div>
                  <div className="auth-hero-feature-desc">{f.desc}</div>
                </div>
              </li>
            ))}
          </ul>
          <div className="auth-hero-langs">
            <span>Available in:</span>
            <div className="auth-hero-lang-chips">
              {['English', 'हिंदी', 'मराठी', 'தமிழ்', 'తెలుగు', 'ಕನ್ನಡ'].map(l => (
                <span key={l} className="auth-hero-lang-chip">{l}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Form panel */}
      <div className="auth-form-panel">
        <div className="auth-card fade-in">
          <div className="auth-header">
            <span className="auth-icon">🌾</span>
            <h1>{t('login')}</h1>
            <p className="auth-subtitle">{t('signInSubtitle')}</p>
          </div>

          {error && <div className="alert-box alert-error mb-3" role="alert">{error}</div>}

          {!otpSent ? (
            <form onSubmit={handleSendOtp}>
              <div className="form-group">
                <label className="form-label" htmlFor="phone">{t('phone')}</label>
                <input
                  id="phone"
                  type="tel"
                  className="form-input"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91XXXXXXXXXX"
                  required
                  autoComplete="tel"
                  autoFocus
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className={`btn btn-primary btn-full btn-lg${loading ? ' btn-loading' : ''}`}
              >
                {loading && <span className="btn-spinner" />}
                {loading ? t('loading') : t('sendOtp')}
              </button>
              {biometricAvailable && (
                <button
                  type="button"
                  className="btn btn-secondary btn-full"
                  style={{ marginTop: '12px' }}
                >
                  {t('useBiometric')}
                </button>
              )}
              {!biometricAvailable && (
                <button
                  type="button"
                  disabled
                  className="btn btn-secondary btn-full"
                  style={{ marginTop: '12px' }}
                >
                  {t('useBiometric')}
                </button>
              )}
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp}>
              <div className="auth-otp-back">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOtpSent(false)}>
                  ← Change number
                </button>
                <span className="auth-otp-phone">{phone}</span>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="otp">{t('otp')}</label>
                <input
                  id="otp"
                  ref={otpRef}
                  type="text"
                  className="form-input auth-otp-input"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="XXXX"
                  required
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  maxLength={6}
                />
                <div className="form-hint">Enter the OTP sent to your mobile number</div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className={`btn btn-primary btn-full btn-lg${loading ? ' btn-loading' : ''}`}
              >
                {loading && <span className="btn-spinner" />}
                {loading ? t('loading') : t('verifyOtp')}
              </button>
            </form>
          )}

          <div className="auth-divider">
            <span>New to KrishiMitra?</span>
          </div>
          <Link to="/register" className="btn btn-secondary btn-full">
            Create account
          </Link>
        </div>
      </div>
    </div>
  );
}
