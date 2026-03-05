import React, { useState, useEffect, useCallback } from 'react';
import { WaterEfficiencyDisplay } from '../components/WaterEfficiencyDisplay';
import { InputEfficiencyDisplay } from '../components/InputEfficiencyDisplay';
import { ClimateRiskDisplay } from '../components/ClimateRiskDisplay';
import {
  getWaterEfficiency,
  getInputEfficiency,
  getClimateRisk,
  getWeatherAlerts,
  WaterEfficiencyData,
  InputEfficiencyData,
  ClimateRiskData,
  WeatherAlert,
} from '../services/sustainabilityClient';

type Tab = 'water' | 'input' | 'climate';

interface Props {
  farmId?: string;
}

export const SustainabilityPage: React.FC<Props> = ({ farmId = 'default-farm' }) => {
  const [activeTab, setActiveTab] = useState<Tab>('water');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [waterData, setWaterData] = useState<WaterEfficiencyData | null>(null);
  const [inputData, setInputData] = useState<InputEfficiencyData | null>(null);
  const [climateData, setClimateData] = useState<ClimateRiskData | null>(null);
  const [weatherAlerts, setWeatherAlerts] = useState<WeatherAlert[]>([]);

  const loadData = useCallback(async (tab: Tab) => {
    setLoading(true);
    setError(null);
    try {
      switch (tab) {
        case 'water': {
          const data = await getWaterEfficiency(farmId);
          setWaterData(data);
          break;
        }
        case 'input': {
          const data = await getInputEfficiency(farmId);
          setInputData(data);
          break;
        }
        case 'climate': {
          const [risk, alerts] = await Promise.all([
            getClimateRisk(farmId),
            getWeatherAlerts(farmId),
          ]);
          setClimateData(risk);
          setWeatherAlerts(alerts);
          break;
        }
      }
    } catch {
      setError('Failed to load sustainability data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [farmId]);

  useEffect(() => {
    loadData(activeTab);
  }, [activeTab, loadData]);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'water', label: 'Water Efficiency' },
    { key: 'input', label: 'Input / Yield' },
    { key: 'climate', label: 'Climate Risk' },
  ];

  const containerStyle: React.CSSProperties = {
    maxWidth: 700,
    margin: '0 auto',
    fontFamily: 'sans-serif',
  };

  const headerStyle: React.CSSProperties = {
    padding: '12px 16px',
    backgroundColor: '#2e7d32',
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
    color: active ? '#2e7d32' : '#666',
    borderTop: 'none',
    borderLeft: 'none',
    borderRight: 'none',
    borderBottom: active ? '3px solid #2e7d32' : '3px solid transparent',
    backgroundColor: 'transparent',
    fontSize: 14,
  });

  return (
    <div style={containerStyle} data-testid="sustainability-page">
      <div style={headerStyle}>Sustainability Dashboard</div>

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
          {activeTab === 'water' && <WaterEfficiencyDisplay data={waterData} />}
          {activeTab === 'input' && <InputEfficiencyDisplay data={inputData} />}
          {activeTab === 'climate' && <ClimateRiskDisplay data={climateData} alerts={weatherAlerts} />}
        </div>
      )}
    </div>
  );
};
