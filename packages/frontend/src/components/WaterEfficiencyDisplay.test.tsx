import React from 'react';
import { render, screen } from '@testing-library/react';
import { WaterEfficiencyDisplay } from './WaterEfficiencyDisplay';
import { WaterEfficiencyData } from '../services/sustainabilityClient';

const makeData = (overrides?: Partial<WaterEfficiencyData>): WaterEfficiencyData => ({
  liters_per_hectare: 5200,
  rating: 'Medium Efficiency',
  explanation: 'Your water usage is 5,200 liters/hectare, which is similar to the typical range of 4,000-6,000 liters/hectare for Tomato',
  benchmark_range: { min: 4000, max: 6000 },
  confidence: 'high',
  crop: 'Tomato',
  total_water_liters: 26000,
  total_hectares: 5,
  data_points: 12,
  conservation_tips: ['Consider switching to drip irrigation.', 'Mulching can reduce evaporation.'],
  last_updated: '2024-06-15T10:00:00.000Z',
  ...overrides,
});

describe('WaterEfficiencyDisplay', () => {
  // Req 13.7: Display water usage trends with visual charts
  it('renders visual chart when data is provided', () => {
    render(<WaterEfficiencyDisplay data={makeData()} />);
    expect(screen.getByTestId('water-efficiency-display')).toBeInTheDocument();
    expect(screen.getByTestId('water-chart')).toBeInTheDocument();
  });

  // Req 13.3: Efficiency rating display
  it('displays efficiency rating', () => {
    render(<WaterEfficiencyDisplay data={makeData()} />);
    expect(screen.getByTestId('water-rating')).toHaveTextContent('Medium Efficiency');
  });

  it('displays High Efficiency rating', () => {
    render(<WaterEfficiencyDisplay data={makeData({ rating: 'High Efficiency' })} />);
    expect(screen.getByTestId('water-rating')).toHaveTextContent('High Efficiency');
  });

  it('displays Low Efficiency rating', () => {
    render(<WaterEfficiencyDisplay data={makeData({ rating: 'Low Efficiency' })} />);
    expect(screen.getByTestId('water-rating')).toHaveTextContent('Low Efficiency');
  });

  // Req 13.4: Explanation of efficiency logic
  it('displays explanation with benchmark comparison', () => {
    render(<WaterEfficiencyDisplay data={makeData()} />);
    expect(screen.getByTestId('water-explanation')).toHaveTextContent('Your water usage is 5,200 liters/hectare');
  });

  // Last Updated timestamp
  it('displays last updated timestamp', () => {
    render(<WaterEfficiencyDisplay data={makeData()} />);
    expect(screen.getByTestId('water-last-updated')).toHaveTextContent('Last Updated:');
  });

  // Confidence indicator
  it('displays confidence indicator', () => {
    render(<WaterEfficiencyDisplay data={makeData()} />);
    expect(screen.getByTestId('water-confidence')).toHaveTextContent('High');
  });

  // Conservation tips
  it('displays conservation tips when present', () => {
    render(<WaterEfficiencyDisplay data={makeData()} />);
    expect(screen.getByTestId('conservation-tips')).toBeInTheDocument();
    expect(screen.getByText('Consider switching to drip irrigation.')).toBeInTheDocument();
  });

  it('does not show conservation tips when empty', () => {
    render(<WaterEfficiencyDisplay data={makeData({ conservation_tips: [] })} />);
    expect(screen.queryByTestId('conservation-tips')).not.toBeInTheDocument();
  });

  // Unavailable data handling
  it('shows unavailable message when data is null', () => {
    render(<WaterEfficiencyDisplay data={null} />);
    expect(screen.getByTestId('water-efficiency-unavailable')).toHaveTextContent('Water efficiency data is currently unavailable');
  });
});
