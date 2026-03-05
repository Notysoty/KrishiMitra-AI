import React from 'react';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GPSCapture } from './GPSCapture';

// Store original geolocation
const originalGeolocation = navigator.geolocation;

function mockGeolocation(impl: Partial<Geolocation>) {
  Object.defineProperty(navigator, 'geolocation', {
    value: impl,
    writable: true,
    configurable: true,
  });
}

afterEach(() => {
  Object.defineProperty(navigator, 'geolocation', {
    value: originalGeolocation,
    writable: true,
    configurable: true,
  });
});

test('renders Use GPS button', () => {
  render(<GPSCapture onCapture={jest.fn()} />);
  expect(screen.getByTestId('gps-button')).toHaveTextContent('Use GPS');
});

test('shows loading state while getting position', async () => {
  // Never resolve to keep loading
  mockGeolocation({
    getCurrentPosition: jest.fn(),
  });
  const user = userEvent.setup();
  render(<GPSCapture onCapture={jest.fn()} />);
  await user.click(screen.getByTestId('gps-button'));
  expect(screen.getByTestId('gps-button')).toHaveTextContent('Getting location...');
  expect(screen.getByTestId('gps-button')).toBeDisabled();
});

test('calls onCapture with coordinates on success', async () => {
  const onCapture = jest.fn();
  mockGeolocation({
    getCurrentPosition: jest.fn((success) => {
      success({ coords: { latitude: 20.5937, longitude: 78.9629 } } as GeolocationPosition);
    }),
  });
  const user = userEvent.setup();
  render(<GPSCapture onCapture={onCapture} />);
  await user.click(screen.getByTestId('gps-button'));
  expect(onCapture).toHaveBeenCalledWith({ latitude: 20.5937, longitude: 78.9629 });
});

test('displays coordinates when value is provided', () => {
  render(<GPSCapture onCapture={jest.fn()} value={{ latitude: 20.5937, longitude: 78.9629 }} />);
  expect(screen.getByTestId('gps-coords')).toHaveTextContent('Lat: 20.5937');
  expect(screen.getByTestId('gps-coords')).toHaveTextContent('Lng: 78.9629');
});

test('shows error when GPS is not available', async () => {
  mockGeolocation(undefined as unknown as Geolocation);
  Object.defineProperty(navigator, 'geolocation', { value: undefined, writable: true, configurable: true });
  const user = userEvent.setup();
  render(<GPSCapture onCapture={jest.fn()} />);
  await user.click(screen.getByTestId('gps-button'));
  expect(screen.getByTestId('gps-error')).toHaveTextContent('GPS is not available');
});

test('shows error when permission denied', async () => {
  mockGeolocation({
    getCurrentPosition: jest.fn((_success, error) => {
      error!({ code: 1, message: 'denied', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError);
    }),
  });
  const user = userEvent.setup();
  render(<GPSCapture onCapture={jest.fn()} />);
  await user.click(screen.getByTestId('gps-button'));
  expect(screen.getByTestId('gps-error')).toHaveTextContent('permission denied');
});

test('shows error when position unavailable', async () => {
  mockGeolocation({
    getCurrentPosition: jest.fn((_success, error) => {
      error!({ code: 2, message: 'unavailable', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError);
    }),
  });
  const user = userEvent.setup();
  render(<GPSCapture onCapture={jest.fn()} />);
  await user.click(screen.getByTestId('gps-button'));
  expect(screen.getByTestId('gps-error')).toHaveTextContent('unavailable');
});

test('rejects coordinates outside India bounds', async () => {
  mockGeolocation({
    getCurrentPosition: jest.fn((success) => {
      success({ coords: { latitude: 51.5, longitude: -0.12 } } as GeolocationPosition);
    }),
  });
  const onCapture = jest.fn();
  const user = userEvent.setup();
  render(<GPSCapture onCapture={onCapture} />);
  await user.click(screen.getByTestId('gps-button'));
  expect(onCapture).not.toHaveBeenCalled();
  expect(screen.getByTestId('gps-error')).toHaveTextContent('outside India');
});
