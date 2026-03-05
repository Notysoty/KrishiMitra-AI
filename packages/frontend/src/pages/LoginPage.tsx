import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTranslation } from '../i18n';
import { isBiometricAvailable } from '../services/authClient';

export function LoginPage() {
  const { login, verifyOtp, loading, error } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const biometricAvailable = isBiometricAvailable();

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await login(phone);
    if (result.success) setOtpSent(true);
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await verifyOtp(phone, otp);
    if (result.success) navigate('/');
  };

  return (
    <div style={{ maxWidth: 400, margin: '40px auto', padding: 20 }}>
      <h1>{t('login')}</h1>
      {error && <p role="alert" style={{ color: 'red' }}>{error}</p>}
      {!otpSent ? (
        <form onSubmit={handleSendOtp}>
          <label>
            {t('phone')}
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91XXXXXXXXXX"
              required
              style={{ display: 'block', width: '100%', padding: 8, marginTop: 4 }}
            />
          </label>
          <button type="submit" disabled={loading} style={{ marginTop: 12, padding: '8px 16px' }}>
            {loading ? t('loading') : t('sendOtp')}
          </button>
          {biometricAvailable && (
            <button type="button" style={{ marginTop: 8, padding: '8px 16px', display: 'block' }}>
              Use Biometric
            </button>
          )}
          {!biometricAvailable && (
            <button type="button" disabled style={{ marginTop: 8, padding: '8px 16px', display: 'block' }}>
              Use Biometric
            </button>
          )}
        </form>
      ) : (
        <form onSubmit={handleVerifyOtp}>
          <label>
            {t('otp')}
            <input
              type="text"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="XXXX"
              required
              style={{ display: 'block', width: '100%', padding: 8, marginTop: 4 }}
            />
          </label>
          <button type="submit" disabled={loading} style={{ marginTop: 12, padding: '8px 16px' }}>
            {loading ? t('loading') : t('verifyOtp')}
          </button>
        </form>
      )}
    </div>
  );
}
