import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '../i18n';
import { LoginPage } from './LoginPage';

function makeJwt(phone: string, expOffset = 3600): string {
  const header = btoa(JSON.stringify({ alg: 'HS256' }));
  const payload = btoa(JSON.stringify({ phone, sub: 'u1', roles: ['farmer'], exp: Math.floor(Date.now() / 1000) + expOffset }));
  return `${header}.${payload}.fakeSignature`;
}

beforeEach(() => {
  localStorage.clear();
  global.fetch = jest.fn((url: string, options?: RequestInit) => {
    const body = options?.body ? JSON.parse(options.body as string) : {};
    if (url.endsWith('/login')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ message: 'OTP sent' }) } as Response);
    }
    if (url.endsWith('/verify-otp')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ token: makeJwt(body.phone) }) } as Response);
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'Not found' }) } as Response);
  }) as jest.Mock;
});

function renderLoginPage() {
  return render(
    <MemoryRouter>
      <I18nProvider>
        <LoginPage />
      </I18nProvider>
    </MemoryRouter>
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
