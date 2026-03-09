import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useAuth } from './useAuth';

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
    if (url.endsWith('/register')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ token: makeJwt(body.phone) }) } as Response);
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'Not found' }) } as Response);
  }) as jest.Mock;
});

function TestComponent() {
  const { user, isAuthenticated, login, verifyOtp, register, logout, loading, error } = useAuth();
  return (
    <div>
      <span data-testid="auth">{String(isAuthenticated)}</span>
      <span data-testid="user">{user?.phone || 'none'}</span>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="error">{error || 'none'}</span>
      <button onClick={() => login('+911234567890')}>Login</button>
      <button onClick={() => verifyOtp('+911234567890', '1234')}>Verify</button>
      <button onClick={() => register('+911234567890', 'Test')}>Register</button>
      <button onClick={() => logout()}>Logout</button>
    </div>
  );
}

test('initial state is not authenticated', () => {
  render(<TestComponent />);
  expect(screen.getByTestId('auth')).toHaveTextContent('false');
  expect(screen.getByTestId('user')).toHaveTextContent('none');
});

test('login sets loading state', async () => {
  const user = userEvent.setup();
  render(<TestComponent />);
  await user.click(screen.getByText('Login'));
  await waitFor(() => {
    expect(screen.getByTestId('loading')).toHaveTextContent('false');
  });
});

test('verifyOtp authenticates user', async () => {
  const user = userEvent.setup();
  render(<TestComponent />);
  await user.click(screen.getByText('Verify'));
  await waitFor(() => {
    expect(screen.getByTestId('auth')).toHaveTextContent('true');
    expect(screen.getByTestId('user')).toHaveTextContent('+911234567890');
  });
});

test('register authenticates user', async () => {
  const user = userEvent.setup();
  render(<TestComponent />);
  await user.click(screen.getByText('Register'));
  await waitFor(() => {
    expect(screen.getByTestId('auth')).toHaveTextContent('true');
  });
});

test('logout clears user', async () => {
  const user = userEvent.setup();
  render(<TestComponent />);
  await user.click(screen.getByText('Verify'));
  await waitFor(() => expect(screen.getByTestId('auth')).toHaveTextContent('true'));
  await user.click(screen.getByText('Logout'));
  expect(screen.getByTestId('auth')).toHaveTextContent('false');
  expect(screen.getByTestId('user')).toHaveTextContent('none');
});
