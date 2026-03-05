import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MarketIntelligencePage } from './MarketIntelligencePage';

const mockGetMarketPrices = jest.fn();
const mockGetMarketRecommendations = jest.fn();
const mockGetPriceForecast = jest.fn();
const mockCreatePriceAlert = jest.fn();
const mockGetPriceAlerts = jest.fn();
const mockGetAlertNotifications = jest.fn();

jest.mock('../services/marketClient', () => ({
  getMarketPrices: (...args: any[]) => mockGetMarketPrices(...args),
  getMarketRecommendations: (...args: any[]) => mockGetMarketRecommendations(...args),
  getPriceForecast: (...args: any[]) => mockGetPriceForecast(...args),
  createPriceAlert: (...args: any[]) => mockCreatePriceAlert(...args),
  getPriceAlerts: (...args: any[]) => mockGetPriceAlerts(...args),
  getAlertNotifications: (...args: any[]) => mockGetAlertNotifications(...args),
}));

const mockPrices = [
  { id: 'p1', market_name: 'Azadpur Mandi', crop: 'Tomato', price: 38.5, unit: 'kg', date: new Date().toISOString(), source: 'Agmarknet', volatility: 'low' as const, location: { latitude: 28.7, longitude: 77.2 } },
  { id: 'p2', market_name: 'Vashi Market', crop: 'Tomato', price: 36.0, unit: 'kg', date: new Date().toISOString(), source: 'Synthetic Data (Demo)', volatility: 'medium' as const, location: { latitude: 19.0, longitude: 73.0 } },
  { id: 'p3', market_name: 'Koyambedu Market', crop: 'Tomato', price: 40.0, unit: 'kg', date: new Date().toISOString(), source: 'Agmarknet', volatility: 'high' as const, location: { latitude: 13.0, longitude: 80.2 } },
];

const mockRecommendations = [
  { market_name: 'Azadpur Mandi', price: 38.5, distance: 25, transport_cost: 125, net_profit: 37.0, volatility: 'low' as const, explanation: 'Highest price. Close distance.', top_factors: ['Higher price: ₹38.50/kg', 'Lower distance: 25km', 'Stable prices'] },
  { market_name: 'Koyambedu Market', price: 40.0, distance: 150, transport_cost: 750, net_profit: 25.0, volatility: 'high' as const, explanation: 'Highest price but long distance.', top_factors: ['Highest price: ₹40.00/kg', 'Long distance: 150km'] },
];

const mockForecast = {
  crop: 'Tomato',
  forecast_price: 35.5,
  confidence_level: 'medium' as const,
  confidence_interval: { lower: 28.0, upper: 43.0 },
  methodology: 'Based on last 6 months of price patterns using moving average',
  disclaimer: 'Forecasts are estimates based on historical patterns and may not reflect actual future prices',
  last_updated: new Date().toISOString(),
};

const mockAlerts = [
  { id: 'alert-1', crop: 'Tomato', market: 'Azadpur Mandi', condition: 'above' as const, threshold: 40, active: true, created_at: new Date().toISOString() },
];

const mockNotifications = [
  { id: 'notif-1', type: 'price_change' as const, title: 'Tomato price alert', message: 'Tomato prices up 20% at Azadpur Mandi.', crop: 'Tomato', market: 'Azadpur Mandi', priority: 'high' as const, actionable_info: 'Current price: ₹42.00/kg.', created_at: new Date().toISOString(), read: false },
];

beforeEach(() => {
  mockGetMarketPrices.mockReset();
  mockGetMarketRecommendations.mockReset();
  mockGetPriceForecast.mockReset();
  mockCreatePriceAlert.mockReset();
  mockGetPriceAlerts.mockReset();
  mockGetAlertNotifications.mockReset();

  mockGetMarketPrices.mockResolvedValue({ prices: mockPrices, last_updated: new Date().toISOString() });
  mockGetMarketRecommendations.mockResolvedValue(mockRecommendations);
  mockGetPriceForecast.mockResolvedValue(mockForecast);
  mockGetPriceAlerts.mockResolvedValue(mockAlerts);
  mockGetAlertNotifications.mockResolvedValue(mockNotifications);
  mockCreatePriceAlert.mockResolvedValue({ id: 'alert-new', crop: 'Wheat', market: 'Vashi Market', condition: 'above', threshold: 30, active: true, created_at: new Date().toISOString() });
});

describe('MarketIntelligencePage', () => {
  it('renders page with header and tabs', async () => {
    render(<MarketIntelligencePage />);
    expect(screen.getByTestId('market-intelligence-page')).toBeInTheDocument();
    expect(screen.getByText('Market Intelligence')).toBeInTheDocument();
    expect(screen.getByTestId('tab-prices')).toBeInTheDocument();
    expect(screen.getByTestId('tab-recommendations')).toBeInTheDocument();
    expect(screen.getByTestId('tab-forecast')).toBeInTheDocument();
    expect(screen.getByTestId('tab-alerts')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('market-price-chart')).toBeInTheDocument());
  });

  // Req 9.1: Display historical market prices
  it('displays market prices with source labels and volatility', async () => {
    render(<MarketIntelligencePage />);
    await waitFor(() => expect(screen.getByTestId('market-price-chart')).toBeInTheDocument());
    expect(screen.getByTestId('last-updated')).toBeInTheDocument();
    expect(screen.getByTestId('price-comparison')).toBeInTheDocument();
  });

  // Req 9.6: Stale data warning
  it('shows stale data warning when data is older than 7 days', async () => {
    const staleDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    mockGetMarketPrices.mockResolvedValueOnce({ prices: mockPrices, last_updated: staleDate });
    render(<MarketIntelligencePage />);
    await waitFor(() => expect(screen.getByTestId('stale-data-warning')).toBeInTheDocument());
    expect(screen.getByTestId('stale-data-warning')).toHaveTextContent('Data may be outdated');
  });

  // Req 10.1, 10.3, 10.4: Market recommendations with explanations and net profit
  it('displays market recommendations with explanations and net profit', async () => {
    const user = userEvent.setup();
    render(<MarketIntelligencePage />);
    await waitFor(() => expect(screen.getByTestId('tab-content')).toBeInTheDocument());
    await user.click(screen.getByTestId('tab-recommendations'));
    await waitFor(() => expect(screen.getByTestId('market-recommendations')).toBeInTheDocument());
    expect(screen.getByTestId('recommendation-0')).toBeInTheDocument();
    expect(screen.getByTestId('net-profit-0')).toBeInTheDocument();
    expect(screen.getByTestId('explanation-0')).toBeInTheDocument();
    expect(screen.getByTestId('top-factors-0')).toBeInTheDocument();
  });

  // Req 10.5: Distance warning for >100km
  it('shows distance warning for markets over 100km', async () => {
    const user = userEvent.setup();
    render(<MarketIntelligencePage />);
    await waitFor(() => expect(screen.getByTestId('tab-content')).toBeInTheDocument());
    await user.click(screen.getByTestId('tab-recommendations'));
    await waitFor(() => expect(screen.getByTestId('distance-warning-1')).toBeInTheDocument());
    expect(screen.getByTestId('distance-warning-1')).toHaveTextContent('Long distance');
  });

  // Req 11.1, 11.2, 11.3, 11.5: Price forecast with confidence intervals
  it('displays price forecast with confidence interval and methodology', async () => {
    const user = userEvent.setup();
    render(<MarketIntelligencePage />);
    await waitFor(() => expect(screen.getByTestId('tab-content')).toBeInTheDocument());
    await user.click(screen.getByTestId('tab-forecast'));
    await waitFor(() => expect(screen.getByTestId('price-forecast')).toBeInTheDocument());
    expect(screen.getByTestId('forecast-price')).toBeInTheDocument();
    expect(screen.getByTestId('confidence-interval')).toBeInTheDocument();
    expect(screen.getByTestId('confidence-level')).toBeInTheDocument();
    expect(screen.getByTestId('methodology')).toBeInTheDocument();
    expect(screen.getByTestId('forecast-disclaimer')).toHaveTextContent('Forecasts are estimates');
  });

  // Req 11.4: Low confidence warning
  it('shows low confidence warning for forecast', async () => {
    mockGetPriceForecast.mockResolvedValueOnce({ ...mockForecast, confidence_level: 'low' });
    const user = userEvent.setup();
    render(<MarketIntelligencePage />);
    await waitFor(() => expect(screen.getByTestId('tab-content')).toBeInTheDocument());
    await user.click(screen.getByTestId('tab-forecast'));
    await waitFor(() => expect(screen.getByTestId('low-confidence-warning')).toBeInTheDocument());
    expect(screen.getByTestId('low-confidence-warning')).toHaveTextContent('Prediction uncertainty is high');
  });

  // Req 12.2, 12.4: Alert configuration and notifications
  it('displays alerts tab with notifications and alert config', async () => {
    const user = userEvent.setup();
    render(<MarketIntelligencePage />);
    await waitFor(() => expect(screen.getByTestId('tab-content')).toBeInTheDocument());
    await user.click(screen.getByTestId('tab-alerts'));
    await waitFor(() => expect(screen.getByTestId('alert-notifications')).toBeInTheDocument());
    expect(screen.getByTestId('price-alert-config')).toBeInTheDocument();
    expect(screen.getByTestId('notification-notif-1')).toBeInTheDocument();
    expect(screen.getByTestId('notif-actionable-notif-1')).toBeInTheDocument();
  });

  // Req 12.3: Create custom price alert
  it('creates a new price alert', async () => {
    const user = userEvent.setup();
    render(<MarketIntelligencePage />);
    await waitFor(() => expect(screen.getByTestId('tab-content')).toBeInTheDocument());
    await user.click(screen.getByTestId('tab-alerts'));
    await waitFor(() => expect(screen.getByTestId('alert-form')).toBeInTheDocument());

    await user.selectOptions(screen.getByTestId('alert-crop-select'), 'Wheat');
    await user.selectOptions(screen.getByTestId('alert-market-select'), 'Vashi Market');
    await user.type(screen.getByTestId('alert-threshold-input'), '30');
    await user.click(screen.getByTestId('create-alert-btn'));

    await waitFor(() => expect(mockCreatePriceAlert).toHaveBeenCalledWith({ crop: 'Wheat', market: 'Vashi Market', condition: 'above', threshold: 30 }));
  });

  // Crop selector changes data
  it('reloads data when crop is changed', async () => {
    const user = userEvent.setup();
    render(<MarketIntelligencePage />);
    await waitFor(() => expect(mockGetMarketPrices).toHaveBeenCalledWith('Tomato'));
    await user.selectOptions(screen.getByTestId('crop-selector'), 'Rice');
    await waitFor(() => expect(mockGetMarketPrices).toHaveBeenCalledWith('Rice'));
  });

  // Error handling
  it('displays error message on API failure', async () => {
    mockGetMarketPrices.mockRejectedValueOnce(new Error('Network error'));
    render(<MarketIntelligencePage />);
    await waitFor(() => expect(screen.getByTestId('error-message')).toBeInTheDocument());
    expect(screen.getByTestId('error-message')).toHaveTextContent('Failed to load data');
  });
});
