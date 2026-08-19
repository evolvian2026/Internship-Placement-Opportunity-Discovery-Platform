'use client';

import type { AuthUser } from '@odp/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { api, clearSession, getStoredToken, storeSession, REFRESH_TOKEN_KEY } from '@/lib/api';

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const loadUser = useCallback(async () => {
    if (!getStoredToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      setUser(await api.auth.me());
    } catch {
      // An unusable token is cleared rather than left to fail every request.
      clearSession();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUser();
  }, [loadUser]);

  const login = useCallback(
    async (email: string, password: string) => {
      const auth = await api.auth.login({ email, password });
      storeSession(auth);
      setUser(auth.user);
      router.push(auth.user.role === 'ADMIN' ? '/admin' : '/dashboard');
    },
    [router],
  );

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      const auth = await api.auth.register({ name, email, password });
      storeSession(auth);
      setUser(auth.user);
      // New accounts go straight into profile setup — matching depends on it.
      router.push('/onboarding');
    },
    [router],
  );

  const logout = useCallback(async () => {
    const refreshToken = typeof window !== 'undefined' ? window.localStorage.getItem(REFRESH_TOKEN_KEY) : null;
    if (refreshToken) await api.auth.logout(refreshToken).catch(() => undefined);
    clearSession();
    setUser(null);
    router.push('/');
  }, [router]);

  const value = useMemo<AuthState>(
    () => ({ user, loading, login, register, logout, refresh: loadUser }),
    [user, loading, login, register, logout, loadUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
