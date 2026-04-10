import type { AuthTokens } from "../types";

const STORAGE_KEY = "netflow_tokens";

export const getStoredTokens = (): AuthTokens | null => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as AuthTokens;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
};

export const setStoredTokens = (tokens: AuthTokens | null): void => {
  if (!tokens) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
};

export const clearStoredTokens = (): void => {
  localStorage.removeItem(STORAGE_KEY);
};
