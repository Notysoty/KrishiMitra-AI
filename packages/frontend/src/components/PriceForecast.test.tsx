import React from 'react';
import { render, screen } from '@testing-library/react';
import { PriceForecast } from './PriceForecast';
import { PriceForecastData } from '../services/marketClient';

const mockForecast: PriceForecastData = {
  crop: 'Tomato',
  forecast_price: 35.5,
  confidence_level: 'medium',
  confidence_interval: { lower: 28.0, upper: 43.0 },
  methodology: 'Based on last 6 months of price patterns using moving average',
  disclaimer: 'Forecasts are estimates based on historical patterns and may not reflect actual future prices',
  last_updated: new Date().toISOString(),
};

describe('PriceForecast', () => {
  it('renders empty state when no forecast', () => {
    render(<PriceForecast forecast={null} />);
    expect(screen.getByTestId('no-forecast')).toBeInTheDocument();
  });

  // Req 11.1: Forecast price with confidence label
  it('displays forecast price and confidence level', () => {
    render(<PriceForecast forecast={mockForecast} />);
    expect(screen.getByTestId('forecast-price')).toBeInTheDocument();
    expect(screen.getByTestId('confidence-level')).toHaveTextContent('Medium');
  });

  // Req 11.2: Confidence interval range
  it('displays confidence interval range', () => {
    render(<PriceForecast forecast={mockForecast} />);
    const ci = screen.getByTestId('confidence-interval');
    expect(ci.textContent).toContain('₹');
    expect(ci.textContent).toContain('28');
    expect(ci.textContent).toContain('43');
  });

  // Req 11.3: Disclaimer
  it('displays forecast disclaimer', () => {
    render(<PriceForecast forecast={mockForecast} />);
    expect(screen.getByTestId('forecast-disclaimer')).toHaveTextContent('Forecasts are estimates');
  });

  // Req 11.5: Methodology explanation
  it('displays methodology explanation', () => {
    render(<PriceForecast forecast={mockForecast} />);
    expect(screen.getByTestId('methodology')).toHaveTextContent('Based on last 6 months');
  });

  // Req 11.4: Low confidence warning
  it('shows low confidence warning', () => {
    render(<PriceForecast forecast={{ ...mockForecast, confidence_level: 'low' }} />);
    expect(screen.getByTestId('low-confidence-warning')).toHaveTextContent('Prediction uncertainty is high');
  });

  it('does not show low confidence warning for medium/high', () => {
    render(<PriceForecast forecast={mockForecast} />);
    expect(screen.queryByTestId('low-confidence-warning')).not.toBeInTheDocument();
  });

  // Req 11.6: Significant price change highlight
  it('shows significant change warning when variation is large', () => {
    const bigRange = { ...mockForecast, confidence_interval: { lower: 10, upper: 60 } };
    render(<PriceForecast forecast={bigRange} />);
    expect(screen.getByTestId('significant-change-warning')).toBeInTheDocument();
  });

  it('displays last updated timestamp', () => {
    render(<PriceForecast forecast={mockForecast} />);
    expect(screen.getByTestId('forecast-last-updated')).toHaveTextContent('Last Updated:');
  });
});
