import React from 'react';
import { ClimateRiskData, WeatherAlert } from '../services/sustainabilityClient';

interface Props {
  data: ClimateRiskData | null;
  alerts: WeatherAlert[];
}

const riskColors: Record<string, { bg: string; border: string; text: string }> = {
  high: { bg: '#ffebee', border: '#ef9a9a', text: '#c62828' },
  medium: { bg: '#fff3e0', border: '#ffb74d', text: '#e65100' },
  low: { bg: '#e8f5e9', border: '#a5d6a7', text: '#2e7d32' },
};

const severityColors: Record<string, { bg: string; text: string }> = {
  emergency: { bg: '#c62828', text: '#fff' },
  warning: { bg: '#f9a825', text: '#333' },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export const ClimateRiskDisplay: React.FC<Props> = ({ data, alerts }) => {
  if (!data) {
    return (
      <div data-testid="climate-risk-unavailable" style={{ padding: 16, color: '#888' }}>
        Climate risk information unavailable. Weather data could not be retrieved.
      </div>
    );
  }

  if (!data.weather_available) {
    return (
      <div data-testid="weather-unavailable" style={{ padding: 16 }}>
        <div role="alert" style={{ padding: '8px 12px', backgroundColor: '#fff3e0', border: '1px solid #ffb74d', borderRadius: 6, fontSize: 13, color: '#e65100' }}>
          Climate risk information unavailable. Weather data last updated: {formatDate(data.last_updated)}
        </div>
      </div>
    );
  }

  const colors = riskColors[data.risk_level] || riskColors.low;

  return (
    <div data-testid="climate-risk-display" style={{ padding: 16 }}>
      <h3>Climate Risk Index</h3>

      <div data-testid="climate-last-updated" style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
        Last Updated: {formatDate(data.last_updated)}
      </div>

      <div data-testid="climate-risk-level" style={{
        display: 'inline-block', padding: '6px 16px', borderRadius: 12,
        fontWeight: 700, fontSize: 16,
        color: colors.text, backgroundColor: colors.bg,
        border: `2px solid ${colors.border}`,
      }}>
        {data.risk_level.charAt(0).toUpperCase() + data.risk_level.slice(1)} Risk
      </div>

      {/* Contributing Factors */}
      {data.contributing_factors.length > 0 && (
        <div data-testid="contributing-factors" style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Contributing Factors</div>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: '#333' }}>
            {data.contributing_factors.map((factor, i) => (
              <li key={i} style={{ marginBottom: 4 }}>{factor}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Recommendations */}
      {data.recommendations.length > 0 && (
        <div data-testid="climate-recommendations" style={{ marginTop: 16, padding: 12, backgroundColor: '#e3f2fd', borderRadius: 8 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>🛡️ Recommendations</div>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13 }}>
            {data.recommendations.map((rec, i) => (
              <li key={i} style={{ marginBottom: 4 }}>{rec}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 7-Day Weather Forecast */}
      {data.forecast.length > 0 && (
        <div data-testid="weather-forecast" style={{ marginTop: 20 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>🌤️ 7-Day Weather Forecast</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ backgroundColor: '#f5f5f5' }}>
                  <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Date</th>
                  <th style={{ padding: '6px 8px', textAlign: 'center', borderBottom: '1px solid #ddd' }}>Temp (°C)</th>
                  <th style={{ padding: '6px 8px', textAlign: 'center', borderBottom: '1px solid #ddd' }}>Rain Prob.</th>
                  <th style={{ padding: '6px 8px', textAlign: 'center', borderBottom: '1px solid #ddd' }}>Wind (km/h)</th>
                </tr>
              </thead>
              <tbody>
                {data.forecast.map((day, i) => (
                  <tr key={i} data-testid={`forecast-day-${i}`} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '6px 8px' }}>{formatDate(day.date)}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>{day.temperature}°C</td>
                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>{day.rainfall_probability}%</td>
                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>{day.wind_speed} km/h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Weather Alerts */}
      {alerts.length > 0 && (
        <div data-testid="weather-alerts" style={{ marginTop: 20 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>⚠️ Weather Alerts</div>
          {alerts.map((alert) => {
            const sColors = severityColors[alert.severity] || severityColors.warning;
            return (
              <div key={alert.id} data-testid={`weather-alert-${alert.id}`} style={{
                marginBottom: 10, padding: 12, borderRadius: 8,
                backgroundColor: sColors.bg === '#c62828' ? '#ffebee' : '#fff8e1',
                border: `1px solid ${sColors.bg}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span data-testid={`alert-severity-${alert.id}`} style={{
                    display: 'inline-block', padding: '2px 8px', borderRadius: 4,
                    fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                    backgroundColor: sColors.bg, color: sColors.text,
                  }}>
                    {alert.severity}
                  </span>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{alert.title}</span>
                </div>
                <div style={{ fontSize: 13, color: '#333', marginBottom: 6 }}>{alert.message}</div>
                <div data-testid={`alert-advice-${alert.id}`} style={{
                  fontSize: 12, color: '#1565c0', fontWeight: 500,
                  padding: '4px 8px', backgroundColor: '#e3f2fd', borderRadius: 4,
                }}>
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
