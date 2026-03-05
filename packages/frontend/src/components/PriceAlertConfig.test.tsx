import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PriceAlertConfig } from './PriceAlertConfig';

const mockAlerts = [
  { id: 'alert-1', crop: 'Tomato', market: 'Azadpur Mandi', condition: 'above' as const, threshold: 40, active: true, created_at: new Date().toISOString() },
];

describe('PriceAlertConfig', () => {
  it('renders alert form and existing alerts', () => {
    render(<PriceAlertConfig existingAlerts={mockAlerts} onCreateAlert={jest.fn()} />);
    expect(screen.getByTestId('price-alert-config')).toBeInTheDocument();
    expect(screen.getByTestId('alert-form')).toBeInTheDocument();
    expect(screen.getByTestId('existing-alerts')).toBeInTheDocument();
    expect(screen.getByTestId('alert-item-alert-1')).toBeInTheDocument();
  });

  // Req 12.3: Custom threshold alerts
  it('creates a new alert with crop, market, condition, threshold', async () => {
    const onCreateAlert = jest.fn();
    const user = userEvent.setup();
    render(<PriceAlertConfig existingAlerts={[]} onCreateAlert={onCreateAlert} />);

    await user.selectOptions(screen.getByTestId('alert-crop-select'), 'Wheat');
    await user.selectOptions(screen.getByTestId('alert-market-select'), 'Vashi Market');
    await user.selectOptions(screen.getByTestId('alert-condition-select'), 'below');
    await user.type(screen.getByTestId('alert-threshold-input'), '25');
    await user.click(screen.getByTestId('create-alert-btn'));

    expect(onCreateAlert).toHaveBeenCalledWith({
      crop: 'Wheat',
      market: 'Vashi Market',
      condition: 'below',
      threshold: 25,
    });
  });

  it('shows success message after creating alert', async () => {
    const user = userEvent.setup();
    render(<PriceAlertConfig existingAlerts={[]} onCreateAlert={jest.fn()} />);

    await user.selectOptions(screen.getByTestId('alert-crop-select'), 'Rice');
    await user.selectOptions(screen.getByTestId('alert-market-select'), 'Azadpur Mandi');
    await user.type(screen.getByTestId('alert-threshold-input'), '20');
    await user.click(screen.getByTestId('create-alert-btn'));

    await waitFor(() => expect(screen.getByTestId('alert-created-msg')).toBeInTheDocument());
  });

  // Req 12.4: Configure alerts for specific crops and markets
  it('provides crop and market selection dropdowns', () => {
    render(<PriceAlertConfig existingAlerts={[]} onCreateAlert={jest.fn()} />);
    expect(screen.getByTestId('alert-crop-select')).toBeInTheDocument();
    expect(screen.getByTestId('alert-market-select')).toBeInTheDocument();
  });

  it('does not submit with empty fields', async () => {
    const onCreateAlert = jest.fn();
    const user = userEvent.setup();
    render(<PriceAlertConfig existingAlerts={[]} onCreateAlert={onCreateAlert} />);
    await user.click(screen.getByTestId('create-alert-btn'));
    expect(onCreateAlert).not.toHaveBeenCalled();
  });
});
