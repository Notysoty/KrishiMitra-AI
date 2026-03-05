import {
  login, verifyOtp, register, logout, getToken,
  isAuthenticated, refreshToken, isTokenExpired, getUser, isBiometricAvailable,
} from './authClient';

beforeEach(() => localStorage.clear());

test('login returns success', async () => {
  const result = await login('+911234567890');
  expect(result.success).toBe(true);
  expect(result.message).toBe('OTP sent');
});

test('verifyOtp stores token on valid OTP', async () => {
  const result = await verifyOtp('+911234567890', '1234');
  expect(result.success).toBe(true);
  expect(result.token).toBeTruthy();
  expect(getToken()).toBeTruthy();
});

test('verifyOtp rejects short OTP', async () => {
  const result = await verifyOtp('+911234567890', '12');
  expect(result.success).toBe(false);
  expect(getToken()).toBeNull();
});

test('register stores token', async () => {
  const result = await register('+911234567890', 'Test User');
  expect(result.success).toBe(true);
  expect(getToken()).toBeTruthy();
});

test('isAuthenticated returns true after login', async () => {
  await verifyOtp('+911234567890', '1234');
  expect(isAuthenticated()).toBe(true);
});

test('isAuthenticated returns false when no token', () => {
  expect(isAuthenticated()).toBe(false);
});

test('logout clears token', async () => {
  await verifyOtp('+911234567890', '1234');
  logout();
  expect(getToken()).toBeNull();
  expect(isAuthenticated()).toBe(false);
});

test('isTokenExpired detects expired token', () => {
  const header = btoa(JSON.stringify({ alg: 'HS256' }));
  const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) - 100 }));
  const token = `${header}.${payload}.${btoa('sig')}`;
  expect(isTokenExpired(token)).toBe(true);
});

test('isTokenExpired returns false for valid token', () => {
  const header = btoa(JSON.stringify({ alg: 'HS256' }));
  const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }));
  const token = `${header}.${payload}.${btoa('sig')}`;
  expect(isTokenExpired(token)).toBe(false);
});

test('getUser returns user info from token', async () => {
  await verifyOtp('+911234567890', '1234');
  const user = getUser();
  expect(user).not.toBeNull();
  expect(user!.phone).toBe('+911234567890');
});

test('getUser returns null when no token', () => {
  expect(getUser()).toBeNull();
});

test('refreshToken refreshes existing token', async () => {
  await verifyOtp('+911234567890', '1234');
  const oldToken = getToken();
  const result = await refreshToken();
  expect(result.success).toBe(true);
  expect(result.token).toBeTruthy();
  expect(result.token).not.toBe(oldToken);
});

test('refreshToken fails when no token', async () => {
  const result = await refreshToken();
  expect(result.success).toBe(false);
});

test('isBiometricAvailable returns boolean', () => {
  expect(typeof isBiometricAvailable()).toBe('boolean');
});
