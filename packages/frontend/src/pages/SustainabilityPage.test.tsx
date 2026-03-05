import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SustainabilityPage } from './SustainabilityPage';

const mockGetWaterEfficiency = jest.fn();
const mockGetInputEfficiency = jest.fn();
const mockGetClimateRisk = jest.fn();
const mockGetWeatherAlerts = jest.fn();

jest.mock('../services/sustainabilityClient', () => ({
  getWaterEfficiency: (...args: any[]) => mockGetWaterEfficiency(...args),
  getInputEfficiency: (...args: any[]) => mockGetInputEfficiency(...args),
  getClimateRisk: (...args: any[]) => mockGetClimateRisk(...args),
  getWeatherAlerts: (...args: any[]) => mockGetWeatherAlerts(...args),
}));

const mockWaterData = {
  liters_per_hectare: 5200,
  rating: 'Medium Efficiency' as const,
  explanation: 'Your water usage is 5,200 liters/hectare, which is similar to the typical range of 4,000-6,000 liters/hectare for Tomato',
  benchmark_range: { min: 4000, max: 6000 },
  confidence: 'high' as const,
  crop: 'Tomato',
  total_water_liters: 26000,
  total_hectares: 5,
  data_points: 12,
  conservation_tips: ['Consider drip irrigation.'],
  last_updated: new Date().toISOString(),
};

const mockInputData = {
  cost_per_kg: 8.5,
  rating: 'Medium Efficiency' as const,
  explanation: 'Your input cost is ₹8.50 per kg, which is similar to the typical range of ₹5-12 per kg',
  benchmark_range: { min: 5, max: 12 },
  confidence: 'medium' as const,
  crop: 'Tomato',
  total_input_cost: 42500,
  total_yield_kg: 5000,
  data_points: 8,
  potential_savings: 5000,
  last_updated: new Date().toISOString(),
};

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

const mockClimateData = {
  risk_level: 'medium' as const,
  risks: [{ type: 'heavy_rainfall', severity: 'medium' as const, description: 'Moderate rainfall expected' }],
  recommendations: ['Ensure drainage channels are clear.'],
  contributing_factors: ['Moderate rainfall expected during flowering stage'],
  forecast: makeForecast(),
  last_updated: new Date().toISOString(),
  weather_available: true,
};

const mockAlerts = [
  {
    id: 'wa-1',
    type: 'heavy_rain' as const,
    severity: 'warning' as const,
    title: 'Heavy Rain Expected',
    message: 'Heavy rainfall expected in the next 48 hours.',
    advice: 'Ensure drainage channels are clear.',
    created_at: new Date().toISOString(),
  },
];

beforeEach(() => {
  mockGetWaterEfficiency.mockReset();
  mockGetInputEfficiency.mockReset();
  mockGetClimateRisk.mockReset();
  mockGetWeatherAlerts.mockReset();

  mockGetWaterEfficiency.mockResolvedValue(mockWaterData);
  mockGetInputEfficiency.mockResolvedValue(mockInputData);
  mockGetClimateRisk.mockResolvedValue(mockClimateData);
  mockGetWeatherAlerts.mockResolvedValue(mockAlerts);
});

describe('SustainabilityPage', () => {
  it('renders page with header and tabs', async () => {
    render(<SustainabilityPage />);
    expect(screen.getByTestId('sustainability-page')).toBeInTheDocument();
    expect(screen.getByText('Sustainability Dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('tab-water')).toBeInTheDocument();
    expect(screen.getByTestId('tab-input')).toBeInTheDocument();
    expect(screen.getByTestId('tab-climate')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('water-efficiency-display')).toBeInTheDocument());
  });

  // Req 13.3, 13.4, 13.7: Water efficiency with chart and rating
  it('displays water efficiency data on default tab', async () => {
    render(<SustainabilityPage />);
    await waitFor(() => expect(screen.getByTestId('water-efficiency-display')).toBeInTheDocument());
    expect(screen.getByTestId('water-rating')).toHaveTextContent('Medium Efficiency');
    expect(screen.getByTestId('water-chart')).toBeInTheDocument();
    expect(screen.getByTestId('water-last-updated')).toHaveTextContent('Last Updated:');
    expect(screen.getByTestId('water-explanation')).toBeInTheDocument();
  });

  // Req 14.3, 14.4, 14.7: Input cost/yield tracking
  it('displays input efficiency data when tab is clicked', async () => {
    const user = userEvent.setup();
    render(<SustainabilityPage />);
    await waitFor(() => expect(screen.getByTestId('tab-content')).toBeInTheDocument());
    await user.click(screen.getByTestId('tab-input'));
    await waitFor(() => expect(screen.getByTestId('input-efficiency-display')).toBeInTheDocument());
    expect(screen.getByTestId('input-rating')).toHaveTextContent('Medium Efficiency');
    expect(screen.getByTestId('input-chart')).toBeInTheDocument();
    expect(screen.getByTestId('input-last-updated')).toHaveTextContent('Last Updated:');
  });

  // Req 15.1, 15.2, 15.6, 15.8: Climate risk with forecast and factors
  it('displays climate risk data with forecast and alerts', async () => {
    const user = userEvent.setup();
    render(<SustainabilityPage />);
    await waitFor(() => expect(screen.getByTestId('tab-content')).toBeInTheDocument());
    await user.click(screen.getByTestId('tab-climate'));
    await waitFor(() => expect(screen.getByTestId('climate-risk-display')).toBeInTheDocument());
    expect(screen.getByTestId('climate-risk-level')).toHaveTextContent('Medium Risk');
    expect(screen.getByTestId('contributing-factors')).toBeInTheDocument();
    expect(screen.getByTestId('climate-recommendations')).toBeInTheDocument();
    expect(screen.getByTestId('weather-forecast')).toBeInTheDocument();
    expect(screen.getByTestId('climate-last-updated')).toHaveTextContent('Last Updated:');
  });

  // Req 16.4: Weather alerts with actionable advice
  it('displays weather alerts with advice on climate tab', async () => {
    const user = userEvent.setup();
    render(<SustainabilityPage />);
    await waitFor(() => expect(screen.getByTestId('tab-content')).toBeInTheDocument());
    await user.click(screen.getByTestId('tab-climate'));
    await waitFor(() => expect(screen.getByTestId('weather-alerts')).toBeInTheDocument());
    expect(screen.getByTestId('weather-alert-wa-1')).toBeInTheDocument();
    expect(screen.getByTestId('alert-advice-wa-1')).toHaveTextContent('Ensure drainage channels are clear');
  });

  // Req 15.7: Unavailable weather data
  it('handles unavailable weather data gracefully', async () => {
    mockGetClimateRisk.mockResolvedValueOnce({ ...mockClimateData, weather_available: false });
    const user = userEvent.setup();
    render(<SustainabilityPage />);
    await waitFor(() => expect(screen.getByTestId('tab-content')).toBeInTheDocument());
    await user.click(screen.getByTestId('tab-climate'));
    await waitFor(() => expect(screen.getByTestId('weather-unavailable')).toBeInTheDocument());
  });

  // Error handling
  it('displays error message on API failure', async () => {
    mockGetWaterEfficiency.mockRejectedValueOnce(new Error('Network error'));
    render(<SustainabilityPage />);
    await waitFor(() => expect(screen.getByTestId('error-message')).toBeInTheDocument());
    expect(screen.getByTestId('error-message')).toHaveTextContent('Failed to load sustainability data');
  });

  // Passes farmId to API calls
  it('passes farmId to API calls', async () => {
    render(<SustainabilityPage farmId="farm-123" />);
    await waitFor(() => expect(mockGetWaterEfficiency).toHaveBeenCalledWith('farm-123'));
  });
});
