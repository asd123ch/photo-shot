import { GeneratedImage } from '../types';
import { getAppPassword } from '../config';

// Server-side history (shared across devices). The index (metadata) lives at
// /api/history/index.json and is password-gated; generated images are stored as
// files under /api/history/img/<uuid>.<ext> (write gated, read open so <img>
// tags work). In dev there is no proxy, so we fall back to localStorage.

const isDev = !!(import.meta as any).env?.DEV;
const BASE = '/api/history';
const LS_KEY = 'photoshot_history';

const authHeaders = (extra: Record<string, string> = {}): Record<string, string> => ({
  'X-App-Password': getAppPassword(),
  ...extra,
});

export const loadHistory = async (): Promise<GeneratedImage[]> => {
  if (isDev) {
    try {
      const raw = localStorage.getItem(LS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  try {
    const res = await fetch(`${BASE}/index.json`, { headers: authHeaders(), cache: 'no-store' });
    if (!res.ok) return []; // 404 = no history yet
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
};

export const saveHistory = async (items: GeneratedImage[]): Promise<void> => {
  if (isDev) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(items)); } catch { /* quota */ }
    return;
  }
  try {
    await fetch(`${BASE}/index.json`, {
      method: 'PUT',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(items),
    });
  } catch { /* offline: keep in memory for this session */ }
};

export const clearHistory = async (): Promise<void> => {
  if (isDev) {
    try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
    return;
  }
  try {
    await fetch(`${BASE}/index.json`, {
      method: 'PUT',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: '[]',
    });
  } catch { /* ignore */ }
};

// Move a generated image onto the server and return its same-origin path so the
// index stays small and the image survives on any device. Handles both base64
// data: URIs (Gemini / OpenRouter / metadata) and remote provider URLs
// (WaveSpeed), which are fetched and re-hosted. Already-local paths and dev mode
// pass through; any failure falls back to the original URL.
export const persistImage = async (id: string, url: string): Promise<string> => {
  if (isDev) return url;
  if (url.startsWith(`${BASE}/`)) return url; // already on our server
  if (!url.startsWith('data:') && !/^https?:\/\//.test(url)) return url;
  try {
    const blob = await (await fetch(url)).blob(); // remote URLs need provider CORS
    if (!blob.size) return url;
    const ext = blob.type.includes('png') ? 'png' : blob.type.includes('webp') ? 'webp' : 'jpg';
    const path = `${BASE}/img/${id}.${ext}`;
    const res = await fetch(path, {
      method: 'PUT',
      headers: authHeaders({ 'Content-Type': blob.type || 'application/octet-stream' }),
      body: blob,
    });
    return res.ok ? path : url;
  } catch {
    return url;
  }
};

// Delete a single re-hosted image file (no-op for remote/data URLs or in dev).
export const deleteImage = async (url: string): Promise<void> => {
  if (isDev || !url.startsWith(`${BASE}/img/`)) return;
  try { await fetch(url, { method: 'DELETE', headers: authHeaders() }); } catch { /* ignore */ }
};
