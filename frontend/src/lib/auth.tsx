'use client';

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiFetch, getToken, onUnauthorized, setToken } from './api';
import { User } from './types';

/** Почему сессии нет: пользователь вышел сам или токен истёк/отозван (401). */
export type SessionEnd = 'logout' | 'expired' | null;

interface AuthState {
  user: User | null;
  sessionEnded: SessionEnd;
  /** true, пока проверяем сохранённый токен при загрузке */
  initializing: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [sessionEnded, setSessionEnded] = useState<SessionEnd>(null);

  useEffect(() => {
    onUnauthorized(() => {
      setUser(null);
      setSessionEnded('expired');
    });
    if (!getToken()) {
      setInitializing(false);
      return () => onUnauthorized(null);
    }
    const ctrl = new AbortController();
    apiFetch<User>('/auth/me', { signal: ctrl.signal })
      .then(setUser)
      .catch((err) => {
        if (err.name === 'AbortError') return;
        // Сеть недоступна — токен не трогаем; 401 уже сбросил его в apiFetch
        setUser(null);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setInitializing(false);
      });
    return () => {
      ctrl.abort();
      onUnauthorized(null);
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiFetch<{ accessToken: string; user: User }>('/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    setToken(res.accessToken);
    setSessionEnded(null);
    setUser(res.user);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setSessionEnded('logout');
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, sessionEnded, initializing, login, logout }),
    [user, sessionEnded, initializing, login, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth вне AuthProvider');
  return ctx;
}
