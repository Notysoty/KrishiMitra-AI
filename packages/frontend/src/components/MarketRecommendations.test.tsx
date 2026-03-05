import React from 'react';
import { render, screen } from '@testing-library/react';
import { MarketRecommendations } from './MarketRecommendations';
import { MarketRecommendation } from '../services/marketClient';

const mockRecs: MarketRecommendation[] = [
  { market_name: 'Azadpur Mandi', price: 38.5, distance: 25, transport_cost: 125, net_profit: 37.0, volatility: 'low', explanation: 'Highest price. Close distance.', top_factors: ['Higher price: ₹38.50/kg', 'Lower distance: 25km', 'Stable prices'] },
  { market_name: 'Koyambedu Market', price: 40.0, distance: 150, transport_cost: 750, net_profit: 25.0, volatility: 'high', explanation: 'Highest price but long distance.', top_factors: ['Highest price: ₹40.00/kg', 'Long distance: 150km'] },
];

describe('MarketRecommendations', () => {
  it('renders empty state', () => {
    render(<MarketRecommendations recommendations={[]} />);
    expect(screen.getByTestId('no-recommendations')).toBeInTheDocument();
  });

  // Req 10.1: Explanations with top factors
  it('displays explanations and top factors', () => {
    render(<MarketRecommendations recommendations={mockRecs} />);
    expect(screen.getByTestId('explanation-0')).toHaveTextContent('Highest price. Close distance.');
    expect(screen.getByTestId('top-factors-0')).toHaveTextContent('Higher price');
    expect(screen.getByTestId('top-factors-0')).toHaveTextContent('Lower distance');
    expect(screen.getByTestId('top-factors-0')).toHaveTextContent('Stable prices');
  });

  // Req 10.3: Net profit display
  it('displays net profit for each recommendation', () => {
    render(<MarketRecommendations recommendations={mockRecs} />);
    expect(screen.getByTestId('net-profit-0')).toBeInTheDocument();
    expect(screen.getByTestId('net-profit-1')).toBeInTheDocument();
  });

  // Req 10.4: Ranked by net profit
  it('shows recommendations ranked by net profit', () => {
    render(<MarketRecommendations recommendations={mockRecs} />);
    expect(screen.getByText(/Markets ranked by estimated net profit/)).toBeInTheDocument();
    const rec0 = screen.getByTestId('recommendation-0');
    const rec1 = screen.getByTestId('recommendation-1');
    expect(rec0.textContent).toContain('Azadpur Mandi');
    expect(rec1.textContent).toContain('Koyambedu Market');
  });

  // Req 10.5: Distance warning
  it('shows distance warning for markets over 100km', () => {
    render(<MarketRecommendations recommendations={mockRecs} />);
    expect(screen.queryByTestId('distance-warning-0')).not.toBeInTheDocument();
    expect(screen.getByTestId('distance-warning-1')).toHaveTextContent('Long distance');
  });
});
