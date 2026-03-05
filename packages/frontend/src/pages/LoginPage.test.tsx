import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '../i18n';
import { LoginPage } from './LoginPage';

beforeEach(() => localStorage.clear());

function renderLoginPage() {
  return render(
    <I18nProvider>
      <LoginPage />
    </I18nProvider>
  );
}

test('renders login page with phone input', () => {
  renderLoginPage();
  expect(screen.getByText('Login')).toBeInTheDocument();
  expect(screen.getByPlaceholderText('+91XXXXXXXXXX')).toBeInTheDocument();
  expect(screen.getByText('Send OTP')).toBeInTheDocument();
});

test('shows OTP input after sending OTP', async () => {
  const user = userEvent.setup();
  renderLoginPage();
  const phoneInput = screen.getByPlaceholderText('+91XXXXXXXXXX');
  await user.type(phoneInput, '+911234567890');
  await user.click(screen.getByText('Send OTP'));
  await waitFor(() => {
    expect(screen.getByPlaceholderText('XXXX')).toBeInTheDocument();
    expect(screen.getByText('Verify OTP')).toBeInTheDocument();
  });
});

test('verifies OTP successfully', async () => {
  const user = userEvent.setup();
  renderLoginPage();
  await user.type(screen.getByPlaceholderText('+91XXXXXXXXXX'), '+911234567890');
  await user.click(screen.getByText('Send OTP'));
  await waitFor(() => screen.getByPlaceholderText('XXXX'));
  await user.type(screen.getByPlaceholderText('XXXX'), '1234');
  await user.click(screen.getByText('Verify OTP'));
  await waitFor(() => {
    expect(localStorage.getItem('krishimitra_token')).toBeTruthy();
  });
});

test('shows biometric button', () => {
  renderLoginPage();
  const bioButtons = screen.getAllByText('Use Biometric');
  expect(bioButtons.length).toBeGreaterThan(0);
});
