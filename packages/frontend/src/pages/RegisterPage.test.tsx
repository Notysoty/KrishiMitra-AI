import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { I18nProvider } from '../i18n';
import { RegisterPage } from './RegisterPage';

function makeJwt(phone: string, expOffset = 3600): string {
  const header = btoa(JSON.stringify({ alg: 'HS256' }));
  const payload = btoa(JSON.stringify({ phone, sub: 'u1', roles: ['farmer'], exp: Math.floor(Date.now() / 1000) + expOffset }));
  return `${header}.${payload}.fakeSignature`;
}

beforeEach(() => {
  localStorage.clear();
  global.fetch = jest.fn((url: string, options?: RequestInit) => {
    const body = options?.body ? JSON.parse(options.body as string) : {};
    if (url.endsWith('/register')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ token: makeJwt(body.phone) }) } as Response);
    }
    if (url.endsWith('/verify-otp')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ token: makeJwt(body.phone) }) } as Response);
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'Not found' }) } as Response);
  }) as jest.Mock;
});

function renderRegisterPage() {
  return render(
    <MemoryRouter>
      <I18nProvider>
        <RegisterPage />
      </I18nProvider>
    </MemoryRouter>
  );
}

test('renders register page with name and phone inputs', () => {
  renderRegisterPage();
  expect(screen.getByText('Register')).toBeInTheDocument();
  expect(screen.getByPlaceholderText('Name')).toBeInTheDocument();
  expect(screen.getByPlaceholderText('+91XXXXXXXXXX')).toBeInTheDocument();
});

test('shows OTP input after registration', async () => {
  const user = userEvent.setup();
  renderRegisterPage();
  await user.type(screen.getByPlaceholderText('Name'), 'Test User');
  await user.type(screen.getByPlaceholderText('+91XXXXXXXXXX'), '+911234567890');
  await user.click(screen.getByText('Submit'));
  await waitFor(() => {
    expect(screen.getByPlaceholderText('XXXX')).toBeInTheDocument();
    expect(screen.getByText('Verify OTP')).toBeInTheDocument();
  });
});

test('completes registration flow', async () => {
  const user = userEvent.setup();
  renderRegisterPage();
  await user.type(screen.getByPlaceholderText('Name'), 'Test User');
  await user.type(screen.getByPlaceholderText('+91XXXXXXXXXX'), '+911234567890');
  await user.click(screen.getByText('Submit'));
  await waitFor(() => screen.getByPlaceholderText('XXXX'));
  await user.type(screen.getByPlaceholderText('XXXX'), '1234');
  await user.click(screen.getByText('Verify OTP'));
  await waitFor(() => {
    expect(localStorage.getItem('krishimitra_token')).toBeTruthy();
  });
});
