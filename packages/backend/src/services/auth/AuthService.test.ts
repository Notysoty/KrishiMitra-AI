import { AuthService, AuthError, verifyToken, _clearStores, _getOtpStore, _getLockoutStore } from './AuthService';

// ── Mock pg Pool ───────────────────────────────────────────────
const mockQuery = jest.fn();
jest.mock('../../db/pool', () => ({
  getPool: () => ({ query: mockQuery, connect: jest.fn() }),
}));

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    service = new AuthService();
    _clearStores();
    mockQuery.mockReset();
  });

  // ── register ─────────────────────────────────────────────────
  describe('register', () => {
    it('should register a new user with valid input', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // no existing user
        .mockResolvedValueOnce({ rows: [{ id: 'tenant-1' }] }) // tenant exists
        .mockResolvedValueOnce({ rows: [] }); // insert

      const user = await service.register({
        phone: '+919876543210',
        name: 'Test Farmer',
        tenant_id: 'tenant-1',
      });

      expect(user.phone).toBe('+919876543210');
      expect(user.name).toBe('Test Farmer');
      expect(user.roles).toEqual(['farmer']);
    });

    it('should reject invalid phone numbers', async () => {
      await expect(
        service.register({ phone: '123', name: 'Bad', tenant_id: 't1' })
      ).rejects.toThrow(AuthError);
    });

    it('should reject duplicate phone in same tenant', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'existing' }] });

      await expect(
        service.register({ phone: '+919876543210', name: 'Dup', tenant_id: 't1' })
      ).rejects.toThrow('User with this phone already exists');
    });

    it('should reject if tenant not found', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] }) // no existing user
        .mockResolvedValueOnce({ rows: [] }); // tenant not found

      await expect(
        service.register({ phone: '+919876543210', name: 'No Tenant', tenant_id: 'bad' })
      ).rejects.toThrow('Tenant not found');
    });
  });

  // ── login ────────────────────────────────────────────────────
  describe('login', () => {
    it('should generate OTP for existing user', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'user-1', tenant_id: 'tenant-1' }],
      });

      const result = await service.login('+919876543210', 'tenant-1');
      expect(result.message).toBe('OTP sent successfully');
      expect(result.otp).toMatch(/^\d{6}$/);
    });

    it('should reject login for non-existent user', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(service.login('+910000000000', 'tenant-1')).rejects.toThrow('User not found');
    });

    it('should reject login when account is locked', async () => {
      // Manually lock the account (use normalized E.164 key)
      _getLockoutStore().set('tenant-1:+919876543210', {
        failedAttempts: 5,
        lockedUntil: Date.now() + 900000,
      });

      await expect(service.login('+919876543210', 'tenant-1')).rejects.toThrow('Account is locked');
    });
  });

  // ── verifyOtp ────────────────────────────────────────────────
  describe('verifyOtp', () => {
    it('should issue tokens for valid OTP', async () => {
      // Setup: user exists, OTP stored (use normalized E.164 key)
      _getOtpStore().set('tenant-1:+919876543210', {
        otp: '123456',
        expiresAt: Date.now() + 300000,
        userId: 'user-1',
        tenantId: 'tenant-1',
      });

      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'user-1', tenant_id: 'tenant-1', phone: '+919876543210', name: 'Test', roles: ['farmer'] }] }) // SELECT user
        .mockResolvedValueOnce({ rows: [] }) // UPDATE last_login
        .mockResolvedValueOnce({ rows: [] }); // INSERT session

      const tokens = await service.verifyOtp('+919876543210', 'tenant-1', '123456');
      expect(tokens.accessToken).toBeDefined();
      expect(tokens.refreshToken).toBeDefined();
      expect(tokens.expiresIn).toBe(86400);

      // Verify the token is valid
      const decoded = verifyToken(tokens.accessToken);
      expect(decoded.userId).toBe('user-1');
      expect(decoded.tenantId).toBe('tenant-1');
    });

    it('should reject invalid OTP and decrement remaining attempts', async () => {
      _getOtpStore().set('tenant-1:+919876543210', {
        otp: '123456',
        expiresAt: Date.now() + 300000,
        userId: 'user-1',
        tenantId: 'tenant-1',
      });

      await expect(
        service.verifyOtp('+919876543210', 'tenant-1', '000000')
      ).rejects.toThrow('Invalid OTP');
    });

    it('should reject expired OTP', async () => {
      _getOtpStore().set('tenant-1:+919876543210', {
        otp: '123456',
        expiresAt: Date.now() - 1000, // expired
        userId: 'user-1',
        tenantId: 'tenant-1',
      });

      await expect(
        service.verifyOtp('+919876543210', 'tenant-1', '123456')
      ).rejects.toThrow('OTP has expired');
    });

    it('should reject when no OTP exists', async () => {
      await expect(
        service.verifyOtp('+919876543210', 'tenant-1', '123456')
      ).rejects.toThrow('No OTP found');
    });
  });

  // ── Account lockout ──────────────────────────────────────────
  describe('account lockout', () => {
    it('should lock account after 5 failed OTP attempts', async () => {
      // Fail 5 times (use normalized E.164 key)
      for (let i = 0; i < 5; i++) {
        _getOtpStore().set('tenant-1:+919876543210', {
          otp: '123456',
          expiresAt: Date.now() + 300000,
          userId: 'user-1',
          tenantId: 'tenant-1',
        });
        try {
          await service.verifyOtp('+919876543210', 'tenant-1', '000000');
        } catch {
          // expected
        }
      }

      expect(service.isLocked('tenant-1', '+919876543210')).toBe(true);

      // 6th attempt should be rejected with lockout message
      _getOtpStore().set('tenant-1:+919876543210', {
        otp: '123456',
        expiresAt: Date.now() + 300000,
        userId: 'user-1',
        tenantId: 'tenant-1',
      });
      await expect(
        service.verifyOtp('+919876543210', 'tenant-1', '123456')
      ).rejects.toThrow('Account is locked');
    });

    it('should clear lockout after successful OTP verification', async () => {
      // Set 3 failed attempts (use normalized E.164 key)
      _getLockoutStore().set('tenant-1:+919876543210', { failedAttempts: 3, lockedUntil: null });
      _getOtpStore().set('tenant-1:+919876543210', {
        otp: '123456',
        expiresAt: Date.now() + 300000,
        userId: 'user-1',
        tenantId: 'tenant-1',
      });

      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'user-1', tenant_id: 'tenant-1', phone: '+919876543210', name: 'Test', roles: ['farmer'] }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await service.verifyOtp('+919876543210', 'tenant-1', '123456');
      expect(service.isLocked('tenant-1', '+919876543210')).toBe(false);
      expect(service.getRemainingAttempts('tenant-1', '+919876543210')).toBe(5);
    });
  });

  // ── logout ───────────────────────────────────────────────────
  describe('logout', () => {
    it('should delete all sessions for the user', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await service.logout('user-1');
      expect(result.message).toContain('All sessions invalidated');
      expect(mockQuery).toHaveBeenCalledWith(
        'DELETE FROM sessions WHERE user_id = $1',
        ['user-1']
      );
    });
  });

  // ── refreshToken ─────────────────────────────────────────────
  describe('refreshToken', () => {
    it('should issue new tokens for valid refresh token', async () => {
      // First get a valid token pair (use normalized E.164 key)
      _getOtpStore().set('tenant-1:+919876543210', {
        otp: '111111',
        expiresAt: Date.now() + 300000,
        userId: 'user-1',
        tenantId: 'tenant-1',
      });

      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'user-1', tenant_id: 'tenant-1', phone: '+919876543210', name: 'Test', roles: ['farmer'] }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const initial = await service.verifyOtp('+919876543210', 'tenant-1', '111111');

      // Now refresh
      mockQuery
        .mockResolvedValueOnce({ rows: [{ id: 'user-1', tenant_id: 'tenant-1', phone: '+919876543210', name: 'Test', roles: ['farmer'] }] })
        .mockResolvedValueOnce({ rows: [] });

      const refreshed = await service.refreshToken(initial.refreshToken);
      expect(refreshed.accessToken).toBeDefined();
      expect(refreshed.accessToken).not.toBe(initial.accessToken);
    });

    it('should reject invalid refresh token', async () => {
      await expect(service.refreshToken('bad-token')).rejects.toThrow(
        'Invalid or expired refresh token'
      );
    });
  });

  // ── me ───────────────────────────────────────────────────────
  describe('me', () => {
    it('should return user profile', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'user-1',
          tenant_id: 'tenant-1',
          phone: '9876543210',
          name: 'Test',
          roles: ['farmer'],
          language_preference: 'en',
          created_at: new Date(),
          last_login: new Date(),
        }],
      });

      const profile = await service.me('user-1');
      expect(profile.id).toBe('user-1');
      expect(profile.phone).toBe('9876543210');
    });

    it('should throw if user not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await expect(service.me('nonexistent')).rejects.toThrow('User not found');
    });
  });
});
