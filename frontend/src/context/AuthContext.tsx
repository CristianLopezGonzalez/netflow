/* eslint-disable react-refresh/only-export-components */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { api } from "../api";
import { setAuthFailureHandler } from "../lib/http";
import { clearStoredTokens, getStoredTokens, setStoredTokens } from "../lib/tokenStorage";
import type { Usuario } from "../types";

interface RegisterPayload {
  nombre: string;
  email: string;
  password: string;
}

interface AuthContextValue {
  user: Usuario | null;
  isAuthenticated: boolean;
  initializing: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => void;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<Usuario | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(Boolean(getStoredTokens()?.access));
  const [initializing, setInitializing] = useState(true);

  const logout = useCallback(() => {
    clearStoredTokens();
    setUser(null);
    setIsAuthenticated(false);
  }, []);

  const refreshMe = useCallback(async () => {
    if (!getStoredTokens()?.access) {
      setUser(null);
      setIsAuthenticated(false);
      return;
    }

    const me = await api.me();
    setUser(me);
    setIsAuthenticated(true);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const tokens = await api.login(email, password);
    setStoredTokens(tokens);
    setIsAuthenticated(true);

    try {
      const me = await api.me();
      setUser(me);
    } catch (error) {
      logout();
      throw error;
    }
  }, [logout]);

  const register = useCallback(async (payload: RegisterPayload) => {
    await api.register(payload);
  }, []);

  useEffect(() => {
    setAuthFailureHandler(() => {
      logout();
    });

    return () => {
      setAuthFailureHandler(null);
    };
  }, [logout]);

  useEffect(() => {
    const bootstrap = async () => {
      if (!getStoredTokens()?.access) {
        setInitializing(false);
        return;
      }

      try {
        await refreshMe();
      } catch {
        logout();
      } finally {
        setInitializing(false);
      }
    };

    void bootstrap();
  }, [logout, refreshMe]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated,
      initializing,
      login,
      register,
      logout,
      refreshMe,
    }),
    [initializing, isAuthenticated, login, logout, refreshMe, register, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth debe usarse dentro de AuthProvider");
  }
  return context;
};
