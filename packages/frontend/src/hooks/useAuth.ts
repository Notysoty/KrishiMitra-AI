import { useState, useCallback, useEffect } from 'react';
import * as authClient from '../services/authClient';

interface UseAuthReturn {
  user: authClient.AuthUser | null;
  isAuthenticated: boolean;
  login: (phone: string) => Promise<{ success: boolean; message: string }>;
  verifyOtp: (phone: string, otp: string) => Promise<{ success: boolean; message: string }>;
  register: (phone: string, name: string) => Promise<{ success: boolean; message: string }>;
  logout: () => void;
  loading: boolean;
  error: string | null;
}

export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<authClient.AuthUser | null>(authClient.getUser);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAuth = authClient.isAuthenticated();

  useEffect(() => {
    setUser(authClient.getUser());
  }, [isAuth]);

  const login = useCallback(async (phone: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await authClient.login(phone);
      if (!result.success) setError(result.message);
      return result;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Login failed';
      setError(msg);
      return { success: false, message: msg };
    } finally {
      setLoading(false);
    }
  }, []);

  const verifyOtp = useCallback(async (phone: string, otp: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await authClient.verifyOtp(phone, otp);
      if (result.success) {
        setUser(authClient.getUser());
      } else {
        setError(result.message);
      }
      return { success: result.success, message: result.message };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Verification failed';
      setError(msg);
      return { success: false, message: msg };
    } finally {
      setLoading(false);
    }
  }, []);

  const register = useCallback(async (phone: string, name: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await authClient.register(phone, name);
      if (result.success) {
        setUser(authClient.getUser());
      } else {
        setError(result.message);
      }
      return { success: result.success, message: result.message };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Registration failed';
      setError(msg);
      return { success: false, message: msg };
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    authClient.logout();
    setUser(null);
    setError(null);
  }, []);

  return { user, isAuthenticated: isAuth, login, verifyOtp, register, logout, loading, error };
}
