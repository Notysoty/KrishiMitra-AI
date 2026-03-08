import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from '../i18n';
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
  const { t } = useTranslation();
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
      setError(t('sustainabilityLoadError'));
    } finally {
      setLoading(false);
    }
  }, [farmId]);

  useEffect(() => {
    loadData(activeTab);
  }, [activeTab, loadData]);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'water', label: t('tabWaterEfficiency') },
    { key: 'input', label: t('tabInputYield') },
    { key: 'climate', label: t('tabClimateRisk') },
  ];

  return (
    <div className="page-container fade-in" data-testid="sustainability-page">
      <div className="card">
        <div className="section-header-light">🌿 {t('sustainabilityDashboard')}</div>

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
          <div data-testid="tab-content">
            {activeTab === 'water' && <WaterEfficiencyDisplay data={waterData} />}
            {activeTab === 'input' && <InputEfficiencyDisplay data={inputData} />}
            {activeTab === 'climate' && <ClimateRiskDisplay data={climateData} alerts={weatherAlerts} />}
          </div>
        )}
      </div>
    </div>
  );
};
