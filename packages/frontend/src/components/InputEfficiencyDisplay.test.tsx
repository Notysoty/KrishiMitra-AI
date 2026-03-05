import React from 'react';
import { render, screen } from '@testing-library/react';
import { InputEfficiencyDisplay } from './InputEfficiencyDisplay';
import { InputEfficiencyData } from '../services/sustainabilityClient';

const makeData = (overrides?: Partial<InputEfficiencyData>): InputEfficiencyData => ({
  cost_per_kg: 8.5,
  rating: 'Medium Efficiency',
  explanation: 'Your input cost is ₹8.50 per kg, which is similar to the typical range of ₹5-12 per kg',
  benchmark_range: { min: 5, max: 12 },
  confidence: 'medium',
  crop: 'Tomato',
  total_input_cost: 42500,
  total_yield_kg: 5000,
  data_points: 8,
  potential_savings: 5000,
  last_updated: '2024-06-15T10:00:00.000Z',
  ...overrides,
});

describe('InputEfficiencyDisplay', () => {
  // Req 14.3: Input cost per unit of yield
  it('renders input efficiency display with chart', () => {
    render(<InputEfficiencyDisplay data={makeData()} />);
    expect(screen.getByTestId('input-efficiency-display')).toBeInTheDocument();
    expect(screen.getByTestId('input-chart')).toBeInTheDocument();
  });

  // Req 14.4: Efficiency insight explanation
  it('displays explanation with benchmark comparison', () => {
    render(<InputEfficiencyDisplay data={makeData()} />);
    expect(screen.getByTestId('input-explanation')).toHaveTextContent('Your input cost is ₹8.50 per kg');
  });

  // Req 14.7: Cost and yield trends over crop cycles
  it('displays rating badge', () => {
    render(<InputEfficiencyDisplay data={makeData()} />);
    expect(screen.getByTestId('input-rating')).toHaveTextContent('Medium Efficiency');
  });

  // Last Updated timestamp
  it('displays last updated timestamp', () => {
    render(<InputEfficiencyDisplay data={makeData()} />);
    expect(screen.getByTestId('input-last-updated')).toHaveTextContent('Last Updated:');
  });

  // Confidence indicator
  it('displays confidence indicator', () => {
    render(<InputEfficiencyDisplay data={makeData()} />);
    expect(screen.getByTestId('input-confidence')).toHaveTextContent('Medium');
  });

  // Potential savings
  it('displays potential savings when available', () => {
    render(<InputEfficiencyDisplay data={makeData()} />);
    expect(screen.getByTestId('potential-savings')).toHaveTextContent('Estimated Potential Savings');
    expect(screen.getByTestId('potential-savings')).toHaveTextContent('₹');
  });

  it('does not show savings when zero', () => {
    render(<InputEfficiencyDisplay data={makeData({ potential_savings: 0 })} />);
    expect(screen.queryByTestId('potential-savings')).not.toBeInTheDocument();
  });

  // Unavailable data handling
  it('shows unavailable message when data is null', () => {
    render(<InputEfficiencyDisplay data={null} />);
    expect(screen.getByTestId('input-efficiency-unavailable')).toHaveTextContent('Input efficiency data is currently unavailable');
  });
});
