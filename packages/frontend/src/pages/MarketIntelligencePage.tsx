import React, { useState, useEffect, useCallback } from 'react';
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

type Tab = 'prices' | 'recommendations' | 'forecast' | 'alerts';

const CROPS = ['Tomato', 'Rice', 'Wheat', 'Onion', 'Potato'];

export const MarketIntelligencePage: React.FC = () => {
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
      setError('Failed to load data. Please try again.');
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
      setError('Failed to create alert.');
    }
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'prices', label: 'Prices' },
    { key: 'recommendations', label: 'Recommendations' },
    { key: 'forecast', label: 'Forecast' },
    { key: 'alerts', label: 'Alerts' },
  ];

  const containerStyle: React.CSSProperties = {
    maxWidth: 700,
    margin: '0 auto',
    fontFamily: 'sans-serif',
  };

  const headerStyle: React.CSSProperties = {
    padding: '12px 16px',
    backgroundColor: '#1976d2',
    color: '#fff',
    fontWeight: 600,
    fontSize: 18,
  };

  const tabBarStyle: React.CSSProperties = {
    display: 'flex',
    borderBottom: '2px solid #e0e0e0',
    backgroundColor: '#fff',
  };

  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: '10px 0',
    textAlign: 'center',
    cursor: 'pointer',
    fontWeight: active ? 700 : 400,
    color: active ? '#1976d2' : '#666',
    borderBottom: active ? '3px solid #1976d2' : '3px solid transparent',
    backgroundColor: 'transparent',
    border: 'none',
    fontSize: 14,
  });

  return (
    <div style={containerStyle} data-testid="market-intelligence-page">
      <div style={headerStyle}>Market Intelligence</div>

      <div style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8, backgroundColor: '#fafafa' }}>
        <label htmlFor="crop-select" style={{ fontSize: 13, fontWeight: 500 }}>Crop:</label>
        <select
          id="crop-select"
          value={selectedCrop}
          onChange={(e) => setSelectedCrop(e.target.value)}
          data-testid="crop-selector"
          style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #ccc' }}
        >
          {CROPS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div style={tabBarStyle}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            style={tabStyle(activeTab === tab.key)}
            onClick={() => setActiveTab(tab.key)}
            data-testid={`tab-${tab.key}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading && (
        <div data-testid="loading-indicator" style={{ padding: 24, textAlign: 'center', color: '#666' }}>
          Loading...
        </div>
      )}

      {error && (
        <div data-testid="error-message" role="alert" style={{ padding: '8px 16px', backgroundColor: '#ffebee', color: '#c62828', fontSize: 13 }}>
          {error}
        </div>
      )}

      {!loading && !error && (
        <div data-testid="tab-content">
          {activeTab === 'prices' && <MarketPriceChart prices={prices} lastUpdated={lastUpdated} />}
          {activeTab === 'recommendations' && <MarketRecommendations recommendations={recommendations} />}
          {activeTab === 'forecast' && <PriceForecast forecast={forecast} />}
          {activeTab === 'alerts' && (
            <>
              <AlertNotifications notifications={notifications} />
              <PriceAlertConfig existingAlerts={alerts} onCreateAlert={handleCreateAlert} />
            </>
          )}
        </div>
      )}
    </div>
  );
};
