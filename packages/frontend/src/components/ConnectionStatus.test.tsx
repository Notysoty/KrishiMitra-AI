import { render, screen } from '@testing-library/react';
import { ConnectionStatusIndicator } from './ConnectionStatus';

// Mock the hook
jest.mock('../hooks/useConnectionStatus', () => ({
  useConnectionStatus: jest.fn(),
}));

import { useConnectionStatus } from '../hooks/useConnectionStatus';

const mockUseConnectionStatus = useConnectionStatus as jest.MockedFunction<typeof useConnectionStatus>;

describe('ConnectionStatusIndicator', () => {
  it('renders Online status', () => {
    mockUseConnectionStatus.mockReturnValue({ status: 'online', since: Date.now() });
    render(<ConnectionStatusIndicator />);
    expect(screen.getByText('Online')).toBeInTheDocument();
    expect(screen.getByTestId('connection-status')).toHaveAttribute('role', 'status');
  });

  it('renders Offline status', () => {
    mockUseConnectionStatus.mockReturnValue({ status: 'offline', since: Date.now() });
    render(<ConnectionStatusIndicator />);
    expect(screen.getByText('Offline')).toBeInTheDocument();
  });

  it('renders Slow Connection status', () => {
    mockUseConnectionStatus.mockReturnValue({ status: 'slow', since: Date.now() });
    render(<ConnectionStatusIndicator />);
    expect(screen.getByText('Slow Connection')).toBeInTheDocument();
  });

  it('has aria-live polite for accessibility', () => {
    mockUseConnectionStatus.mockReturnValue({ status: 'online', since: Date.now() });
    render(<ConnectionStatusIndicator />);
    expect(screen.getByTestId('connection-status')).toHaveAttribute('aria-live', 'polite');
  });

  it('accepts className prop', () => {
    mockUseConnectionStatus.mockReturnValue({ status: 'online', since: Date.now() });
    render(<ConnectionStatusIndicator className="custom-class" />);
    expect(screen.getByTestId('connection-status')).toHaveClass('custom-class');
  });
});
