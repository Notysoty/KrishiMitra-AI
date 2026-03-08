import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '../i18n';
import { MarketPriceChart } from '../components/MarketPriceChart';
import { MarketRecommendations } from '../components/MarketRecommendations';
import { PriceForecast } from '../components/PriceForecast';
import { PriceAlertConfig } from '../components/PriceAlertConfig';
import { AlertNotifications } from '../components/AlertNotifications';
import {
  getMarketPrices,
  getMarketRecommendations,
  getPriceForecast,
  createPriceAlert,
  getPriceAlerts,
  getAlertNotifications,
  MarketPrice,
  MarketRecommendation,
  PriceForecastData,
  PriceAlert,
  AlertNotification,
} from '../services/marketClient';

type Tab = 'prices' | 'recommendations' | 'forecast' | 'alerts' | 'negotiate';

interface NegotiationResult {
  verdict: string;
  offeredPrice: number;
  currentMarketPrice: number;
  bestAvailablePrice?: number;
  bestMarket?: string;
  advice: string;
  comparisons: { market: string; price_per_kg: number }[];
}

const CROPS = ['Tomato', 'Rice', 'Wheat', 'Onion', 'Potato'];

export const MarketIntelligencePage: React.FC = () => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>('prices');
  const [selectedCrop, setSelectedCrop] = useState(CROPS[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [prices, setPrices] = useState<MarketPrice[]>([]);
  const [lastUpdated, setLastUpdated] = useState('');
  const [recommendations, setRecommendations] = useState<MarketRecommendation[]>([]);
  const [forecast, setForecast] = useState<PriceForecastData | null>(null);
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [notifications, setNotifications] = useState<AlertNotification[]>([]);

  // Negotiation state
  const [negotiateMarket, setNegotiateMarket] = useState('');
  const [negotiatePrice, setNegotiatePrice] = useState('');
  const [negotiating, setNegotiating] = useState(false);
  const [negotiationResult, setNegotiationResult] = useState<NegotiationResult | null>(null);

  const loadData = useCallback(async (tab: Tab, crop: string) => {
    setLoading(true);
    setError(null);
    try {
      switch (tab) {
        case 'prices': {
          const res = await getMarketPrices(crop);
          setPrices(res.prices);
          setLastUpdated(res.last_updated);
          break;
        }
        case 'recommendations': {
          const recs = await getMarketRecommendations(crop);
          setRecommendations(recs);
          break;
        }
        case 'forecast': {
          const fc = await getPriceForecast(crop);
          setForecast(fc);
          break;
        }
        case 'alerts': {
          const [al, notifs] = await Promise.all([getPriceAlerts(), getAlertNotifications()]);
          setAlerts(al);
          setNotifications(notifs);
          break;
        }
      }
    } catch {
      setError(t('loadDataError'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(activeTab, selectedCrop);
  }, [activeTab, selectedCrop, loadData]);

  const handleCreateAlert = async (alertData: { crop: string; market: string; condition: 'above' | 'below'; threshold: number }) => {
    try {
      const newAlert = await createPriceAlert(alertData);
      setAlerts((prev) => [...prev, newAlert]);
    } catch {
      setError(t('createAlertError'));
    }
  };

  const handleNegotiate = async () => {
    if (!negotiateMarket || !negotiatePrice) return;
    setNegotiating(true);
    setNegotiationResult(null);
    try {
      const { getToken } = await import('../services/authClient');
      const token = getToken();
      const BASE_URL = process.env.REACT_APP_API_URL ?? 'http://localhost:3000';
      const res = await fetch(`${BASE_URL}/api/v1/markets/negotiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ crop: selectedCrop, market: negotiateMarket, offeredPrice: parseFloat(negotiatePrice) }),
      });
      if (res.ok) {
        setNegotiationResult(await res.json() as NegotiationResult);
      } else {
        setError('Could not fetch negotiation advice. Please try again.');
      }
    } catch {
      setError('Could not fetch negotiation advice. Please try again.');
    } finally {
      setNegotiating(false);
    }
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'prices', label: t('tabPrices') },
    { key: 'recommendations', label: t('tabRecommendations') },
    { key: 'forecast', label: t('tabForecast') },
    { key: 'alerts', label: t('alerts') },
    { key: 'negotiate', label: '🤝 Negotiate' },
  ];

  return (
    <div className="page-container fade-in" data-testid="market-intelligence-page">
      <div className="section-header-light">📊 {t('marketIntelligence')}</div>

      <div className="filter-bar">
        <label htmlFor="crop-select" className="form-label" style={{ marginBottom: 0 }}>{t('cropLabel')}:</label>
        <select
          id="crop-select"
          value={selectedCrop}
          onChange={(e) => setSelectedCrop(e.target.value)}
          data-testid="crop-selector"
          className="form-select"
          style={{ width: 'auto', minWidth: 140 }}
        >
          {CROPS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="tab-bar">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`tab-btn${activeTab === tab.key ? ' active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
            data-testid={`tab-${tab.key}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading && (
        <div data-testid="loading-indicator" className="p-4">
          <div className="skeleton-card" style={{ marginBottom: 16 }} />
          <div className="skeleton-card" />
        </div>
      )}

      {error && (
        <div data-testid="error-message" role="alert" className="alert-box alert-error">
          {error}
        </div>
      )}

      {!loading && !error && (
        <div data-testid="tab-content" className="mt-3" style={{ minHeight: 400, overflowY: 'auto' }}>
          {activeTab === 'prices' && <MarketPriceChart prices={prices} lastUpdated={lastUpdated} />}
          {activeTab === 'recommendations' && <MarketRecommendations recommendations={recommendations} />}
          {activeTab === 'forecast' && <PriceForecast forecast={forecast} />}
          {activeTab === 'alerts' && (
            <>
              <AlertNotifications notifications={notifications} />
              <PriceAlertConfig existingAlerts={alerts} onCreateAlert={handleCreateAlert} />
            </>
          )}
          {activeTab === 'negotiate' && (
            <div style={{ maxWidth: 520 }}>
              <p style={{ color: 'var(--text-muted)', marginBottom: '1.25rem', fontSize: '0.9rem' }}>
                Enter the price a trader is offering you. We&apos;ll check current mandi rates and advise whether to accept, negotiate, or sell elsewhere.
              </p>
              <div className="form-group">
                <label className="form-label">Mandi / Market Name</label>
                <input
                  className="form-input"
                  placeholder="e.g. Azadpur Mandi, Delhi"
                  value={negotiateMarket}
                  onChange={(e) => setNegotiateMarket(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Offered Price (₹/kg)</label>
                <input
                  className="form-input"
                  type="number"
                  placeholder="e.g. 45"
                  value={negotiatePrice}
                  onChange={(e) => setNegotiatePrice(e.target.value)}
                />
              </div>
              <button
                className={`btn btn-primary ${negotiating ? 'btn-loading' : ''}`}
                onClick={handleNegotiate}
                disabled={negotiating || !negotiateMarket || !negotiatePrice}
              >
                {negotiating ? <><span className="btn-spinner" /> Analyzing...</> : '🤝 Is This a Fair Price?'}
              </button>

              {negotiationResult && (
                <div
                  style={{
                    marginTop: '1.5rem',
                    padding: '1.25rem',
                    borderRadius: '12px',
                    background: negotiationResult.verdict === 'fair' ? '#f0fdf4' : negotiationResult.verdict === 'low' ? '#fef2f2' : '#fffbeb',
                    border: `1px solid ${negotiationResult.verdict === 'fair' ? '#86efac' : negotiationResult.verdict === 'low' ? '#fca5a5' : '#fcd34d'}`,
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: '0.5rem' }}>
                    {negotiationResult.verdict === 'fair' ? '✅ Fair Price' : negotiationResult.verdict === 'low' ? '❌ Below Market' : '⚠️ Slightly Below Market'}
                  </div>
                  <p style={{ margin: '0 0 1rem 0', lineHeight: 1.6 }}>{negotiationResult.advice}</p>
                  {negotiationResult.comparisons.length > 0 && (
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.5rem' }}>Current prices at nearby mandis:</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                        {negotiationResult.comparisons.map((c, i) => (
                          <div key={i} style={{ background: 'rgba(255,255,255,0.7)', borderRadius: '8px', padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}>
                            <strong>{c.market}</strong>: ₹{c.price_per_kg}/kg
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
