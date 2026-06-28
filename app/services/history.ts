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

// --- Spend ledger ----------------------------------------------------------
// An append-only running total of what generations actually cost. Unlike the
// history (which prunes after 90 days and loses entries on delete), the ledger
// is never decremented, so it stays a truthful lifetime total. Stored next to
// the index at /api/history/spend.json (dev: localStorage).

const LEDGER_LS_KEY = 'photoshot_spend';

export interface SpendLedger {
  lifetimeTotal: number;                                  // USD, all-time
  lifetimeCount: number;                                  // images generated
  byProvider: Record<string, { total: number; count: number }>;
  byMonth: Record<string, { total: number; count: number }>; // key: "YYYY-MM"
  updatedAt: number;
}

export const emptyLedger = (): SpendLedger => ({
  lifetimeTotal: 0,
  lifetimeCount: 0,
  byProvider: {},
  byMonth: {},
  updatedAt: 0,
});

const monthKey = (ts: number): string => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export const loadLedger = async (): Promise<SpendLedger | null> => {
  if (isDev) {
    try {
      const raw = localStorage.getItem(LEDGER_LS_KEY);
      return raw ? { ...emptyLedger(), ...JSON.parse(raw) } : null;
    } catch {
      return null;
    }
  }
  try {
    const res = await fetch(`${BASE}/spend.json`, { headers: authHeaders(), cache: 'no-store' });
    if (!res.ok) return null; // 404 = no ledger yet
    const data = await res.json();
    return data && typeof data === 'object' ? { ...emptyLedger(), ...data } : null;
  } catch {
    return null;
  }
};

export const saveLedger = async (ledger: SpendLedger): Promise<void> => {
  if (isDev) {
    try { localStorage.setItem(LEDGER_LS_KEY, JSON.stringify(ledger)); } catch { /* quota */ }
    return;
  }
  try {
    await fetch(`${BASE}/spend.json`, {
      method: 'PUT',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(ledger),
    });
  } catch { /* offline: keep in memory for this session */ }
};

const addToLedger = (
  ledger: SpendLedger,
  entries: Array<{ cost: number; provider: string; timestamp: number }>,
): SpendLedger => {
  const next: SpendLedger = {
    lifetimeTotal: ledger.lifetimeTotal,
    lifetimeCount: ledger.lifetimeCount,
    byProvider: { ...ledger.byProvider },
    byMonth: { ...ledger.byMonth },
    updatedAt: Date.now(),
  };
  for (const e of entries) {
    const usd = Number.isFinite(e.cost) ? e.cost : 0;
    next.lifetimeTotal += usd;
    next.lifetimeCount += 1;
    const p = next.byProvider[e.provider] ?? { total: 0, count: 0 };
    next.byProvider[e.provider] = { total: p.total + usd, count: p.count + 1 };
    const mk = monthKey(e.timestamp);
    const m = next.byMonth[mk] ?? { total: 0, count: 0 };
    next.byMonth[mk] = { total: m.total + usd, count: m.count + 1 };
  }
  return next;
};

// Record one generation's spend. Read-modify-write (fine for a single-user
// homelab). Returns the updated ledger so callers can refresh their UI state.
export const recordSpend = async (
  base: SpendLedger | null,
  entry: { cost: number; provider: string; timestamp: number },
): Promise<SpendLedger> => {
  // Re-read the latest persisted ledger right before incrementing, so a spend
  // recorded on another device/tab isn't clobbered by a stale in-memory base.
  // This narrows the lost-update window to a single read-modify-write; a hard
  // guarantee would need server-side compare-and-swap (ETag/If-Match), which the
  // static nginx WebDAV store doesn't provide.
  const current = (await loadLedger()) ?? base ?? emptyLedger();
  const next = addToLedger(current, [entry]);
  await saveLedger(next);
  return next;
};

// One-time seed when no ledger exists yet, so existing users see a meaningful
// lifetime total from day one (limited to whatever history survives the 90-day
// window). Builds the ledger from the given history items and persists it.
export const backfillLedger = async (
  items: Array<{ cost?: number; provider?: string; model?: string; timestamp?: number }>,
  providerOf: (item: { provider?: string; model?: string }) => string,
): Promise<SpendLedger> => {
  const entries = items
    .filter((it) => typeof it.cost === 'number' && it.cost > 0)
    .map((it) => ({ cost: it.cost as number, provider: providerOf(it), timestamp: it.timestamp ?? Date.now() }));
  const next = addToLedger(emptyLedger(), entries);
  await saveLedger(next);
  return next;
};
