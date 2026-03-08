import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '../i18n';
import { ToastProvider } from '../contexts/ToastContext';
import { FarmProfilePage } from './FarmProfilePage';

const renderPage = () => render(<I18nProvider><ToastProvider><FarmProfilePage /></ToastProvider></I18nProvider>);

// Mock geolocation
const originalGeolocation = navigator.geolocation;

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(navigator, 'geolocation', {
    value: {
      getCurrentPosition: jest.fn((success) => {
        success({ coords: { latitude: 20.5937, longitude: 78.9629 } } as GeolocationPosition);
      }),
    },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  Object.defineProperty(navigator, 'geolocation', {
    value: originalGeolocation,
    writable: true,
    configurable: true,
  });
});

test('renders farm profile form', () => {
  renderPage();
  expect(screen.getByTestId('farm-profile-page')).toBeInTheDocument();
  expect(screen.getByTestId('farm-name')).toBeInTheDocument();
  expect(screen.getByTestId('farm-acreage')).toBeInTheDocument();
  expect(screen.getByTestId('farm-state')).toBeInTheDocument();
  expect(screen.getByTestId('farm-district')).toBeInTheDocument();
  expect(screen.getByTestId('farm-irrigation')).toBeInTheDocument();
  expect(screen.getByTestId('farm-soil')).toBeInTheDocument();
});

test('shows tooltips/help text', () => {
  renderPage();
  expect(screen.getByText(/Give your farm a name/)).toBeInTheDocument();
  expect(screen.getByText(/Total cultivable area/)).toBeInTheDocument();
  expect(screen.getByText(/Primary source of water/)).toBeInTheDocument();
});

test('saves profile to localStorage', async () => {
  const user = userEvent.setup();
  renderPage();
  await user.type(screen.getByTestId('farm-name'), 'My Farm');
  await user.click(screen.getByTestId('farm-save'));
  await waitFor(() => {
    expect(screen.getByTestId('farm-saved')).toHaveTextContent(/Profile saved/);
  });
  const stored = JSON.parse(localStorage.getItem('krishimitra_farm_profile')!);
  expect(stored.farmName).toBe('My Farm');
});

test('captures GPS coordinates', async () => {
  const user = userEvent.setup();
  renderPage();
  await user.click(screen.getByTestId('gps-button'));
  expect(screen.getByTestId('gps-coords')).toHaveTextContent('20.5937');
});

test('allows selecting irrigation type', async () => {
  const user = userEvent.setup();
  renderPage();
  await user.selectOptions(screen.getByTestId('farm-irrigation'), 'drip');
  expect((screen.getByTestId('farm-irrigation') as HTMLSelectElement).value).toBe('drip');
});

test('allows selecting soil type', async () => {
  const user = userEvent.setup();
  renderPage();
  await user.selectOptions(screen.getByTestId('farm-soil'), 'black');
  expect((screen.getByTestId('farm-soil') as HTMLSelectElement).value).toBe('black');
});

test('shows help after 3+ failed save attempts', async () => {
  const user = userEvent.setup();
  renderPage();
  // Farm name is empty, so save should fail
  await user.click(screen.getByTestId('farm-save'));
  await user.click(screen.getByTestId('farm-save'));
  expect(screen.queryByTestId('farm-help')).not.toBeInTheDocument();
  await user.click(screen.getByTestId('farm-save'));
  expect(screen.getByTestId('farm-help')).toHaveTextContent('Make sure to fill in');
});

test('includes crop manager', () => {
  renderPage();
  expect(screen.getByTestId('crop-manager')).toBeInTheDocument();
  expect(screen.getByText(/Crops/)).toBeInTheDocument();
});
