import { GeneratedImage } from '../types';
import { findModelByLabel, getProviderLabel, Provider } from './registry';

// Resolve a history item to its provider key. New items store `provider`
// directly; older ones are mapped back via their model label.
export const providerOf = (item: { provider?: string; model?: string }): string => {
  if (item.provider) return item.provider;
  const def = item.model ? findModelByLabel(item.model) : undefined;
  return def?.provider ?? 'unknown';
};

export const providerLabel = (p: string): string => {
  if (p === 'gemini') return 'Gemini (legacy)';
  return p === 'fal' || p === 'wavespeed' || p === 'openrouter' ? getProviderLabel(p as Provider) : 'Other';
};

export interface GroupSpend {
  key: string;
  label: string;
  provider: string;
  total: number;
  count: number;
  estimated: boolean; // at least one item in the group is a price estimate
}

export interface HistorySpend {
  total: number;
  count: number;
  estimated: boolean;
  today: number;
  month: number;
  byProvider: GroupSpend[]; // sorted by spend desc
  byModel: GroupSpend[];    // sorted by spend desc
}

const startOfToday = (): number => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const startOfMonth = (): number => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
};

// Aggregate the (last-90-days) history into per-provider / per-model totals plus
// today / this-month windows. Pure: no I/O, safe to call on every render.
export const aggregateHistory = (items: GeneratedImage[]): HistorySpend => {
  const todayCut = startOfToday();
  const monthCut = startOfMonth();
  let total = 0;
  let count = 0;
  let today = 0;
  let month = 0;
  let estimated = false;
  const provMap = new Map<string, GroupSpend>();
  const modelMap = new Map<string, GroupSpend>();

  for (const it of items) {
    const usd = typeof it.cost === 'number' && it.cost > 0 ? it.cost : 0;
    const ts = it.timestamp ?? 0;
    const isEst = !!it.costEstimate && usd > 0;
    total += usd;
    count += 1;
    if (isEst) estimated = true;
    if (ts >= todayCut) today += usd;
    if (ts >= monthCut) month += usd;

    const prov = providerOf(it);
    const pg = provMap.get(prov) ?? { key: prov, label: providerLabel(prov), provider: prov, total: 0, count: 0, estimated: false };
    pg.total += usd;
    pg.count += 1;
    if (isEst) pg.estimated = true;
    provMap.set(prov, pg);

    const mkey = it.model || 'Unknown model';
    const mg = modelMap.get(mkey) ?? { key: mkey, label: mkey, provider: prov, total: 0, count: 0, estimated: false };
    mg.total += usd;
    mg.count += 1;
    if (isEst) mg.estimated = true;
    modelMap.set(mkey, mg);
  }

  return {
    total,
    count,
    estimated,
    today,
    month,
    byProvider: [...provMap.values()].sort((a, b) => b.total - a.total),
    byModel: [...modelMap.values()].sort((a, b) => b.total - a.total),
  };
};

// USD with 2 decimals, for sums/totals: 4.873 -> "$4.87".
export const fmtUsd2 = (n: number): string => `$${(Math.round(n * 100) / 100).toFixed(2)}`;
