// Centralised client configuration.
//
// IMPORTANT: there are NO secrets in the browser anymore. The API keys live
// only on the server. The browser talks to the same-origin `/api` proxy, which
// injects the real keys server-side (see app/docker/render-config.sh and
// nginx.conf). `config.js` now only advertises WHICH providers are configured
// (booleans, never the keys themselves).

interface RuntimeConfig {
  providers?: {
    gemini?: boolean;
    wavespeed?: boolean;
    openrouter?: boolean;
  };
}

const runtime: RuntimeConfig =
  (typeof window !== 'undefined' && (window as any).__APP_CONFIG__) || {};

const isDev = !!(import.meta as any).env?.DEV;

// Same-origin proxy bases. Each provider is reachable under /api/<provider>/…
export const API_GEMINI_BASE = '/api/gemini';
export const API_WAVESPEED_BASE = '/api/wavespeed';
export const API_OPENROUTER_BASE = '/api/openrouter';

// Which providers have a server-side key. In dev there is no proxy, so assume
// everything is available to keep the UI usable while working on it.
export const PROVIDER_AVAILABLE = {
  gemini: isDev || !!runtime.providers?.gemini,
  wavespeed: isDev || !!runtime.providers?.wavespeed,
  openrouter: isDev || !!runtime.providers?.openrouter,
};

// The unlock password is kept in localStorage so the login persists across app
// launches (the unlock screen otherwise reappears every time). It is stored with
// a 90-day expiry that slides on each launch, so an active user stays logged in.
// It is sent as a header to /api, where the server validates it; never in config.js.
const PW_STORAGE_KEY = 'photoshot_auth';
const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

export const getAppPassword = (): string => {
  try {
    const raw = localStorage.getItem(PW_STORAGE_KEY);
    if (!raw) return '';
    const { pw, exp } = JSON.parse(raw);
    if (!pw || typeof exp !== 'number' || Date.now() > exp) {
      localStorage.removeItem(PW_STORAGE_KEY);
      return '';
    }
    return pw;
  } catch {
    return '';
  }
};

export const setAppPassword = (pw: string): void => {
  try {
    localStorage.setItem(PW_STORAGE_KEY, JSON.stringify({ pw, exp: Date.now() + MAX_AGE_MS }));
  } catch {
    /* localStorage unavailable — ignore */
  }
};

export const clearAppPassword = (): void => {
  try {
    localStorage.removeItem(PW_STORAGE_KEY);
  } catch {
    /* ignore */
  }
};
