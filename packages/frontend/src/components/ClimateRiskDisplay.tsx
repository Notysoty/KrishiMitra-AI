import React from 'react';
import { ClimateRiskData, WeatherAlert } from '../services/sustainabilityClient';

interface Props {
  data: ClimateRiskData | null;
  alerts: WeatherAlert[];
}

const riskBadgeClass: Record<string, string> = {
  high: 'badge badge-red',
  medium: 'badge badge-yellow',
  low: 'badge badge-green',
};

const severityBadgeClass: Record<string, string> = {
  emergency: 'badge badge-red',
  warning: 'badge badge-yellow',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export const ClimateRiskDisplay: React.FC<Props> = ({ data, alerts }) => {
  if (!data) {
    return (
      <div data-testid="climate-risk-unavailable" className="empty-state">
        <div className="empty-icon">🌦️</div>
        <div className="empty-text">Climate risk information unavailable. Weather data could not be retrieved.</div>
      </div>
    );
  }

  if (!data.weather_available) {
    return (
      <div data-testid="weather-unavailable" className="card-body">
        <div role="alert" className="alert-box alert-warning">
          Climate risk information unavailable. Weather data last updated: {formatDate(data.last_updated)}
        </div>
      </div>
    );
  }

  return (
    <div data-testid="climate-risk-display" className="card-body">
      <h3>🌦️ Climate Risk Index</h3>

      <div data-testid="climate-last-updated" style={{ fontSize: '0.75rem', color: 'var(--gray-500)', marginBottom: 12, marginTop: 4 }}>
        Last Updated: {formatDate(data.last_updated)}
      </div>

      <div data-testid="climate-risk-level" className={riskBadgeClass[data.risk_level] || 'badge badge-gray'} style={{ fontSize: '0.875rem', padding: '6px 16px' }}>
        {data.risk_level.charAt(0).toUpperCase() + data.risk_level.slice(1)} Risk
      </div>

      {data.contributing_factors.length > 0 && (
        <div data-testid="contributing-factors" style={{ marginTop: 20 }}>
          <div style={{ fontWeight: 600, fontSize: '0.8125rem', marginBottom: 8, color: 'var(--gray-700)' }}>Contributing Factors</div>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: '0.8125rem', color: 'var(--gray-700)' }}>
            {data.contributing_factors.map((factor, i) => (
              <li key={i} style={{ marginBottom: 4 }}>{factor}</li>
            ))}
          </ul>
        </div>
      )}

      {data.recommendations.length > 0 && (
        <div data-testid="climate-recommendations" className="alert-box alert-info" style={{ marginTop: 20, flexDirection: 'column' }}>
          <div style={{ fontWeight: 600, fontSize: '0.8125rem', marginBottom: 8 }}>🛡️ Recommendations</div>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: '0.8125rem' }}>
            {data.recommendations.map((rec, i) => (
              <li key={i} style={{ marginBottom: 4 }}>{rec}</li>
            ))}
          </ul>
        </div>
      )}

      {data.forecast.length > 0 && (
        <div data-testid="weather-forecast" style={{ marginTop: 24 }}>
          <div style={{ fontWeight: 700, fontSize: '0.875rem', marginBottom: 10, color: 'var(--gray-800)' }}>🌤️ 7-Day Weather Forecast</div>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th style={{ textAlign: 'center' }}>Temp (°C)</th>
                  <th style={{ textAlign: 'center' }}>Rain Prob.</th>
                  <th style={{ textAlign: 'center' }}>Wind (km/h)</th>
                </tr>
              </thead>
              <tbody>
                {data.forecast.map((day, i) => (
                  <tr key={i} data-testid={`forecast-day-${i}`}>
                    <td>{formatDate(day.date)}</td>
                    <td style={{ textAlign: 'center' }}>{day.temperature}°C</td>
                    <td style={{ textAlign: 'center' }}>{day.rainfall_probability}%</td>
                    <td style={{ textAlign: 'center' }}>{day.wind_speed} km/h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {alerts.length > 0 && (
        <div data-testid="weather-alerts" style={{ marginTop: 24 }}>
          <div style={{ fontWeight: 700, fontSize: '0.875rem', marginBottom: 10, color: 'var(--gray-800)' }}>⚠️ Weather Alerts</div>
          {alerts.map((alert) => {
            const isEmergency = alert.severity === 'emergency';
            return (
              <div key={alert.id} data-testid={`weather-alert-${alert.id}`}
                className={`alert-box ${isEmergency ? 'alert-error' : 'alert-warning'}`}
                style={{ marginBottom: 12, flexDirection: 'column' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span data-testid={`alert-severity-${alert.id}`} className={severityBadgeClass[alert.severity] || 'badge badge-yellow'}>
                    {alert.severity}
                  </span>
                  <span style={{ fontWeight: 600, fontSize: '0.8125rem' }}>{alert.title}</span>
                </div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--gray-700)', marginBottom: 8 }}>{alert.message}</div>
                <div data-testid={`alert-advice-${alert.id}`} className="alert-box alert-info" style={{ padding: '6px 10px', fontSize: '0.75rem' }}>
                  💡 {alert.advice}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
