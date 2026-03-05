import React from 'react';
import { render, screen } from '@testing-library/react';
import { ClimateRiskDisplay } from './ClimateRiskDisplay';
import { ClimateRiskData, WeatherAlert } from '../services/sustainabilityClient';

const makeForecast = () => {
  const days = [];
  const now = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    days.push({
      date: d.toISOString().split('T')[0],
      temperature: 30 + i,
      rainfall: 10 + i * 5,
      wind_speed: 12 + i,
      rainfall_probability: 30 + i * 5,
    });
  }
  return days;
};

const makeData = (overrides?: Partial<ClimateRiskData>): ClimateRiskData => ({
  risk_level: 'medium',
  risks: [
    { type: 'heavy_rainfall', severity: 'medium', description: 'Moderate rainfall expected' },
  ],
  recommendations: [
    'Ensure drainage channels are clear.',
    'Monitor soil moisture levels.',
  ],
  contributing_factors: [
    'Moderate rainfall expected during flowering stage',
    'Temperatures within acceptable range',
  ],
  forecast: makeForecast(),
  last_updated: '2024-06-15T10:00:00.000Z',
  weather_available: true,
  ...overrides,
});

const makeAlerts = (): WeatherAlert[] => [
  {
    id: 'wa-1',
    type: 'heavy_rain',
    severity: 'warning',
    title: 'Heavy Rain Expected',
    message: 'Heavy rainfall (60-80mm) expected in the next 48 hours.',
    advice: 'Ensure drainage channels are clear. Delay any planned spraying.',
    created_at: new Date().toISOString(),
  },
  {
    id: 'wa-2',
    type: 'heatwave',
    severity: 'emergency',
    title: 'Extreme Heat Warning',
    message: 'Temperatures exceeding 42°C expected.',
    advice: 'Provide shade for crops. Increase irrigation frequency.',
    created_at: new Date().toISOString(),
  },
];

describe('ClimateRiskDisplay', () => {
  // Req 15.1: Climate Risk Index display
  it('renders climate risk level', () => {
    render(<ClimateRiskDisplay data={makeData()} alerts={[]} />);
    expect(screen.getByTestId('climate-risk-display')).toBeInTheDocument();
    expect(screen.getByTestId('climate-risk-level')).toHaveTextContent('Medium Risk');
  });

  it('renders high risk level', () => {
    render(<ClimateRiskDisplay data={makeData({ risk_level: 'high' })} alerts={[]} />);
    expect(screen.getByTestId('climate-risk-level')).toHaveTextContent('High Risk');
  });

  it('renders low risk level', () => {
    render(<ClimateRiskDisplay data={makeData({ risk_level: 'low' })} alerts={[]} />);
    expect(screen.getByTestId('climate-risk-level')).toHaveTextContent('Low Risk');
  });

  // Req 15.2: Contributing factors
  it('displays contributing factors', () => {
    render(<ClimateRiskDisplay data={makeData()} alerts={[]} />);
    expect(screen.getByTestId('contributing-factors')).toBeInTheDocument();
    expect(screen.getByText('Moderate rainfall expected during flowering stage')).toBeInTheDocument();
  });

  // Req 15.2: Recommendations
  it('displays actionable recommendations', () => {
    render(<ClimateRiskDisplay data={makeData()} alerts={[]} />);
    expect(screen.getByTestId('climate-recommendations')).toBeInTheDocument();
    expect(screen.getByText('Ensure drainage channels are clear.')).toBeInTheDocument();
  });

  // Req 15.8: 7-day weather forecast with temperature, rainfall probability, wind speed
  it('displays 7-day weather forecast table', () => {
    render(<ClimateRiskDisplay data={makeData()} alerts={[]} />);
    expect(screen.getByTestId('weather-forecast')).toBeInTheDocument();
    for (let i = 0; i < 7; i++) {
      expect(screen.getByTestId(`forecast-day-${i}`)).toBeInTheDocument();
    }
  });

  it('shows temperature, rainfall probability, and wind speed in forecast', () => {
    render(<ClimateRiskDisplay data={makeData()} alerts={[]} />);
    const firstRow = screen.getByTestId('forecast-day-0');
    expect(firstRow.textContent).toContain('°C');
    expect(firstRow.textContent).toContain('%');
    expect(firstRow.textContent).toContain('km/h');
  });

  // Req 15.6: Last Updated timestamp
  it('displays last updated timestamp', () => {
    render(<ClimateRiskDisplay data={makeData()} alerts={[]} />);
    expect(screen.getByTestId('climate-last-updated')).toHaveTextContent('Last Updated:');
  });

  // Req 16.4: Weather alerts with actionable advice
  it('displays weather alerts with severity and advice', () => {
    const alerts = makeAlerts();
    render(<ClimateRiskDisplay data={makeData()} alerts={alerts} />);
    expect(screen.getByTestId('weather-alerts')).toBeInTheDocument();
    expect(screen.getByTestId('weather-alert-wa-1')).toBeInTheDocument();
    expect(screen.getByTestId('weather-alert-wa-2')).toBeInTheDocument();
    expect(screen.getByTestId('alert-severity-wa-1')).toHaveTextContent('warning');
    expect(screen.getByTestId('alert-severity-wa-2')).toHaveTextContent('emergency');
    expect(screen.getByTestId('alert-advice-wa-1')).toHaveTextContent('Ensure drainage channels are clear');
    expect(screen.getByTestId('alert-advice-wa-2')).toHaveTextContent('Provide shade for crops');
  });

  it('does not show weather alerts section when no alerts', () => {
    render(<ClimateRiskDisplay data={makeData()} alerts={[]} />);
    expect(screen.queryByTestId('weather-alerts')).not.toBeInTheDocument();
  });

  // Req 15.7: Unavailable weather data handling
  it('shows unavailable message when weather data is not available', () => {
    render(<ClimateRiskDisplay data={makeData({ weather_available: false })} alerts={[]} />);
    expect(screen.getByTestId('weather-unavailable')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Climate risk information unavailable. Weather data last updated:');
  });

  // Null data handling
  it('shows unavailable message when data is null', () => {
    render(<ClimateRiskDisplay data={null} alerts={[]} />);
    expect(screen.getByTestId('climate-risk-unavailable')).toHaveTextContent('Climate risk information unavailable');
  });
});
