import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getUser } from '../services/authClient';
import { getAlerts } from '../services/alertClient';
import { getCurrentWeather, WeatherData } from '../services/weatherClient';

interface FarmProfile {
  farmName: string;
  state: string;
  district: string;
  crops: { cropType: string; status: string }[];
  latitude?: number | null;
  longitude?: number | null;
}

function loadFarmProfile(): FarmProfile | null {
  try {
    const raw = localStorage.getItem('krishimitra_farm_profile');
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return null;
}

function getGreeting(name: string): string {
  const hour = new Date().getHours();
  const time = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const display = name && name !== 'Farmer' ? name : 'Farmer';
  return `${time}, ${display}`;
}

const QUICK_ACTIONS = [
  { icon: '💬', label: 'Ask AI Assistant', desc: 'Get crop & farming advice', path: '/chat', color: '#16a34a' },
  { icon: '🦠', label: 'Disease Detection', desc: 'Upload a crop photo', path: '/chat', color: '#dc2626' },
  { icon: '📊', label: 'Market Prices', desc: 'Check mandi rates', path: '/market', color: '#2563eb' },
  { icon: '🌱', label: 'Sustainability', desc: 'Water & input efficiency', path: '/sustainability', color: '#d97706' },
];

const MOCK_PRICES = [
  { crop: 'Tomato', price: '₹42/kg', change: '+8%', up: true },
  { crop: 'Wheat', price: '₹24/kg', change: '-2%', up: false },
  { crop: 'Onion', price: '₹18/kg', change: '+15%', up: true },
];

const TIPS = [
  'Water your crops early morning to reduce evaporation by up to 30%.',
  'Intercropping legumes with cereals can improve soil nitrogen naturally.',
  'Apply neem-based pesticides to reduce chemical usage and cost.',
  'Check PM-KISAN scheme — next installment due soon. Keep your Aadhaar linked.',
  'Drip irrigation can save up to 50% water compared to flood irrigation.',
];

export function DashboardPage() {
  const navigate = useNavigate();
  const user = getUser();
  const farm = loadFarmProfile();
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  const [tip] = useState(() => TIPS[Math.floor(Math.random() * TIPS.length)]);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [weatherError, setWeatherError] = useState(false);

  useEffect(() => {
    getAlerts()
      .then((alerts) => setUnreadAlerts(alerts.filter((a) => !a.read).length))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (farm?.latitude && farm?.longitude) {
      getCurrentWeather(farm.latitude, farm.longitude)
        .then(setWeather)
        .catch(() => setWeatherError(true));
    }
  }, [farm?.latitude, farm?.longitude]);

  const activeCrops = farm?.crops?.filter((c) => c.status !== 'harvested') ?? [];

  return (
    <div className="page-container fade-in" style={{ maxWidth: 900 }}>

      {/* Greeting */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: '0 0 4px', color: 'var(--gray-900)' }}>
          {getGreeting(user?.name ?? 'Farmer')} 🌾
        </h1>
        {farm ? (
          <p style={{ margin: 0, color: 'var(--gray-500)', fontSize: '0.95rem' }}>
            {farm.farmName} &bull; {farm.district && `${farm.district}, `}{farm.state}
            {activeCrops.length > 0 && ` · ${activeCrops.map((c) => c.cropType).join(', ')}`}
          </p>
        ) : (
          <p style={{ margin: 0, color: 'var(--gray-500)', fontSize: '0.95rem' }}>
            Set up your{' '}
            <button className="btn btn-ghost btn-sm" style={{ padding: '0 4px', fontWeight: 600, color: 'var(--primary)' }} onClick={() => navigate('/farm-profile')}>
              farm profile
            </button>{' '}
            to get personalized advice.
          </p>
        )}
      </div>

      {/* Alert banner */}
      {unreadAlerts > 0 && (
        <div className="alert-box alert-warning mb-4" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>🔔 You have <strong>{unreadAlerts}</strong> unread alert{unreadAlerts > 1 ? 's' : ''}.</span>
          <button className="btn btn-sm btn-secondary" onClick={() => navigate('/chat')}>View</button>
        </div>
      )}

      {/* Quick actions */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 28 }}>
        {QUICK_ACTIONS.map((action) => (
          <button
            key={action.label}
            onClick={() => navigate(action.path)}
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--gray-200)',
              borderRadius: 'var(--radius-md)',
              padding: '18px 16px',
              textAlign: 'left',
              cursor: 'pointer',
              transition: 'box-shadow 0.15s, transform 0.15s',
              boxShadow: 'var(--shadow-sm)',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-md)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-sm)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; }}
          >
            <div style={{ fontSize: '2rem', marginBottom: 8 }}>{action.icon}</div>
            <div style={{ fontWeight: 600, fontSize: '0.92rem', color: 'var(--gray-800)', marginBottom: 2 }}>{action.label}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--gray-500)' }}>{action.desc}</div>
          </button>
        ))}
      </div>

      {/* Market snapshot + Daily tip */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 28 }}>

        {/* Market snapshot */}
        <div className="form-section" style={{ margin: 0 }}>
          <div className="form-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>📊 Market Snapshot</span>
            <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.78rem', color: 'var(--primary)' }} onClick={() => navigate('/market')}>View all →</button>
          </div>
          {MOCK_PRICES.map((p) => (
            <div key={p.crop} className="settings-row" style={{ padding: '10px 0' }}>
              <div style={{ fontWeight: 500, color: 'var(--gray-700)' }}>{p.crop}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 600, color: 'var(--gray-900)' }}>{p.price}</span>
                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: p.up ? '#16a34a' : '#dc2626', background: p.up ? '#f0fdf4' : '#fef2f2', padding: '1px 6px', borderRadius: 999 }}>{p.change}</span>
              </div>
            </div>
          ))}
          <div style={{ fontSize: '0.72rem', color: 'var(--gray-400)', marginTop: 6 }}>Mock data — connect backend for live prices</div>
        </div>

        {/* Daily tip */}
        <div className="form-section" style={{ margin: 0, background: 'var(--primary-50)', borderColor: 'var(--primary-light)' }}>
          <div className="form-section-title" style={{ color: 'var(--primary-700)' }}>💡 Today&apos;s Tip</div>
          <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.6, color: 'var(--primary-800)' }}>{tip}</p>
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 10, color: 'var(--primary)', fontWeight: 600, padding: '0' }} onClick={() => navigate('/chat')}>
            Ask AI for more advice →
          </button>
        </div>
      </div>

      {/* Weather widget */}
      <div className="form-section" style={{ background: 'linear-gradient(135deg, #1e40af 0%, #0369a1 100%)', border: 'none', borderRadius: 'var(--radius-lg)', padding: '20px 24px', color: '#fff', marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.8rem', opacity: 0.8, marginBottom: 4 }}>🌦️ Weather</div>
            {weather ? (
              <>
                <div style={{ fontSize: '1rem', fontWeight: 600 }}>{weather.city}</div>
                <div style={{ fontSize: '2.2rem', fontWeight: 700, margin: '4px 0 2px' }}>{weather.temp}°C</div>
                <div style={{ opacity: 0.9, fontSize: '0.85rem', textTransform: 'capitalize' }}>{weather.description}</div>
                <div style={{ opacity: 0.75, fontSize: '0.78rem', marginTop: 6 }}>
                  Feels like {weather.feelsLike}°C &nbsp;|&nbsp; Humidity {weather.humidity}% &nbsp;|&nbsp; Wind {weather.windSpeed} m/s
                </div>
              </>
            ) : farm?.latitude && farm?.longitude ? (
              <>
                <div style={{ fontSize: '1rem', fontWeight: 600 }}>{farm.district || farm.state || 'Your Farm'}</div>
                <div style={{ opacity: 0.8, fontSize: '0.85rem', marginTop: 4 }}>
                  {weatherError ? 'Weather unavailable — add REACT_APP_OPENWEATHER_API_KEY to .env' : 'Loading weather...'}
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: '1rem', fontWeight: 600 }}>Weather not configured</div>
                <div style={{ opacity: 0.8, fontSize: '0.85rem', marginTop: 4 }}>
                  Add your farm GPS coordinates to see hyperlocal weather
                </div>
              </>
            )}
          </div>
          <div style={{ fontSize: '3.5rem', marginLeft: 12 }}>
            {weather ? <img src={weather.iconUrl} alt={weather.description} style={{ width: 64, height: 64 }} /> : '⛅'}
          </div>
        </div>
        {!weather && (
          <button
            className="btn btn-sm"
            style={{ marginTop: 14, background: 'rgba(255,255,255,0.2)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)' }}
            onClick={() => navigate('/farm-profile')}
          >
            {farm?.latitude ? 'Refresh' : farm?.state ? 'Add GPS Coordinates' : 'Set Up Farm Location'}
          </button>
        )}
      </div>

    </div>
  );
}
