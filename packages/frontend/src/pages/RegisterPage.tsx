import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTranslation } from '../i18n';

export function RegisterPage() {
  const { register, verifyOtp, loading, error } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await register(phone, name);
    if (result.success) setOtpSent(true);
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await verifyOtp(phone, otp);
    if (result.success) navigate('/onboarding');
  };

  return (
    <div className="auth-layout">
      {/* Hero panel */}
      <div className="auth-hero">
        <div className="auth-hero-inner">
          <div className="auth-hero-logo">
            <img src="/logo.svg" alt="KrishiMitra" width={44} height={44} />
            <span className="auth-hero-brand">KrishiMitra</span>
          </div>
          <h2 className="auth-hero-title">Join millions of<br />Indian farmers</h2>
          <p className="auth-hero-subtitle">
            Free AI-powered advice for crop management, disease detection, market prices, and government schemes — all in your language.
          </p>
          <ul className="auth-hero-features">
            <li className="auth-hero-feature">
              <span className="auth-hero-feature-icon">🆓</span>
              <div>
                <div className="auth-hero-feature-title">Always free for farmers</div>
                <div className="auth-hero-feature-desc">No subscription, no hidden charges</div>
              </div>
            </li>
            <li className="auth-hero-feature">
              <span className="auth-hero-feature-icon">🔒</span>
              <div>
                <div className="auth-hero-feature-title">Secure & private</div>
                <div className="auth-hero-feature-desc">Your data stays safe with end-to-end encryption</div>
              </div>
            </li>
            <li className="auth-hero-feature">
              <span className="auth-hero-feature-icon">📶</span>
              <div>
                <div className="auth-hero-feature-title">Works offline</div>
                <div className="auth-hero-feature-desc">Access advice even without internet</div>
              </div>
            </li>
          </ul>
        </div>
      </div>

      {/* Form panel */}
      <div className="auth-form-panel">
        <div className="auth-card fade-in">
          <div className="auth-header">
            <span className="auth-icon">🌱</span>
            <h1>{t('register')}</h1>
            <p className="auth-subtitle">{t('createAccount')}</p>
          </div>

          {error && <div className="alert-box alert-error mb-3" role="alert">{error}</div>}

          {!otpSent ? (
            <form onSubmit={handleSendOtp}>
              <div className="form-group">
                <label className="form-label" htmlFor="reg-name">{t('welcome')}</label>
                <input
                  id="reg-name"
                  type="text"
                  className="form-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Name"
                  required
                  autoComplete="name"
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="reg-phone">{t('phone')}</label>
                <input
                  id="reg-phone"
                  type="tel"
                  className="form-input"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91XXXXXXXXXX"
                  required
                  autoComplete="tel"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className={`btn btn-primary btn-full btn-lg${loading ? ' btn-loading' : ''}`}
              >
                {loading && <span className="btn-spinner" />}
                {loading ? t('loading') : t('submit')}
              </button>
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
                <label className="form-label" htmlFor="reg-otp">{t('otp')}</label>
                <input
                  id="reg-otp"
                  type="text"
                  className="form-input auth-otp-input"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="XXXX"
                  required
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  maxLength={6}
                  autoFocus
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
            <span>Already have an account?</span>
          </div>
          <Link to="/login" className="btn btn-secondary btn-full">
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
