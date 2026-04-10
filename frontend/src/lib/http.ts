import axios from "axios";
import type { AxiosError, InternalAxiosRequestConfig } from "axios";

import type { AuthTokens } from "../types";
import { clearStoredTokens, getStoredTokens, setStoredTokens } from "./tokenStorage";

export const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000/api";

interface RetriableRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

let refreshPromise: Promise<AuthTokens | null> | null = null;
let authFailureHandler: (() => void) | null = null;

export const setAuthFailureHandler = (handler: (() => void) | null): void => {
  authFailureHandler = handler;
};

const refreshAccessToken = async (): Promise<AuthTokens | null> => {
  const current = getStoredTokens();
  if (!current?.refresh) {
    return null;
  }

  try {
    const response = await axios.post<{ access: string; refresh?: string }>(
      `${API_BASE}/auth/refresh`,
      { refresh: current.refresh },
      {
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    const next: AuthTokens = {
      access: response.data.access,
      refresh: response.data.refresh ?? current.refresh,
    };

    setStoredTokens(next);
    return next;
  } catch {
    clearStoredTokens();
    return null;
  }
};

export const http = axios.create({
  baseURL: API_BASE,
  headers: {
    "Content-Type": "application/json",
  },
});

http.interceptors.request.use((config) => {
  const token = getStoredTokens()?.access;
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

http.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<{ detail?: string }>) => {
    const status = error.response?.status;
    const original = error.config as RetriableRequestConfig | undefined;

    if (status === 401 && original && !original._retry) {
      original._retry = true;

      if (!refreshPromise) {
        refreshPromise = refreshAccessToken().finally(() => {
          refreshPromise = null;
        });
      }

      const refreshed = await refreshPromise;
      if (refreshed) {
        original.headers = original.headers ?? {};
        original.headers.Authorization = `Bearer ${refreshed.access}`;
        return http(original);
      }

      authFailureHandler?.();
    }

    return Promise.reject(error);
  },
);
