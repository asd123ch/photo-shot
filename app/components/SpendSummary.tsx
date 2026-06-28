import React, { useMemo, useState } from 'react';
import { Receipt, ChevronDown } from 'lucide-react';
import { GeneratedImage } from '../types';
import { SpendLedger } from '../services/history';
import { aggregateHistory, fmtUsd2, providerLabel } from '../services/spend';
import { formatUsd } from '../services/registry';

interface SpendSummaryProps {
  results: GeneratedImage[];
  ledger: SpendLedger | null;
}

const currentMonthKey = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

// Cost overview for the History tab. Headline figures come from the persistent
// ledger (survives the 90-day prune and per-image deletes); the per-model
// breakdown and "today" figure come from the visible history.
const SpendSummary: React.FC<SpendSummaryProps> = ({ results, ledger }) => {
  const [open, setOpen] = useState(false);
  const agg = useMemo(() => aggregateHistory(results), [results]);

  const lifetimeTotal = ledger ? ledger.lifetimeTotal : agg.total;
  const lifetimeCount = ledger ? ledger.lifetimeCount : agg.count;
  const monthTotal = ledger?.byMonth?.[currentMonthKey()]?.total ?? agg.month;
  const avg = lifetimeCount > 0 ? lifetimeTotal / lifetimeCount : 0;

  const providerRows = useMemo(() => {
    if (ledger && Object.keys(ledger.byProvider).length > 0) {
      return Object.entries(ledger.byProvider)
        .map(([key, v]) => ({ key, label: providerLabel(key), total: v.total, count: v.count }))
        .sort((a, b) => b.total - a.total);
    }
    return agg.byProvider;
  }, [ledger, agg]);

  const topModels = agg.byModel.slice(0, 5);
  const maxModel = topModels.length ? topModels[0].total || 1 : 1;

  if (lifetimeCount === 0) return null;

  return (
    <div className="bg-surface rounded-2xl border border-white/5 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.03] transition-colors"
      >
        <span className="w-9 h-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center flex-shrink-0">
          <Receipt size={18} aria-hidden="true" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-bold text-gray-200">Total spent</span>
          <span className="block text-[11px] text-gray-400 tabular-nums">
            {lifetimeCount} {lifetimeCount === 1 ? 'image' : 'images'} · avg ${formatUsd(avg)}
            {agg.estimated && <span className="text-warning"> · ~ incl. estimates</span>}
          </span>
        </span>
        <span className="text-lg font-bold text-primary tabular-nums flex-shrink-0">{fmtUsd2(lifetimeTotal)}</span>
        <ChevronDown
          size={18}
          aria-hidden="true"
          className={`text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 space-y-5 animate-fade-in">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-background/60 rounded-xl px-3 py-2.5">
              <div className="text-[11px] text-gray-400 mb-0.5">This month</div>
              <div className="text-base font-bold tabular-nums">{fmtUsd2(monthTotal)}</div>
            </div>
            <div className="bg-background/60 rounded-xl px-3 py-2.5">
              <div className="text-[11px] text-gray-400 mb-0.5">Today</div>
              <div className="text-base font-bold tabular-nums">{fmtUsd2(agg.today)}</div>
            </div>
          </div>

          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">By provider</div>
            <div className="divide-y divide-white/5">
              {providerRows.map((p) => (
                <div key={p.key} className="flex items-center justify-between py-2">
                  <div className="min-w-0">
                    <div className="text-sm text-gray-200 truncate">{p.label}</div>
                    <div className="text-[11px] text-gray-400 tabular-nums">{p.count} {p.count === 1 ? 'image' : 'images'}</div>
                  </div>
                  <span className="text-sm font-bold tabular-nums flex-shrink-0">{fmtUsd2(p.total)}</span>
                </div>
              ))}
            </div>
          </div>

          {topModels.length > 0 && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">
                Top models <span className="text-gray-700">· last 90 days</span>
              </div>
              <div className="space-y-2.5">
                {topModels.map((m) => (
                  <div key={m.key}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-gray-200 truncate pr-2">{m.label}</span>
                      <span className="tabular-nums text-gray-300 flex-shrink-0">
                        {m.estimated ? '~' : ''}{fmtUsd2(m.total)} · {m.count}×
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${Math.max(4, Math.round((m.total / maxModel) * 100))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-[10px] text-gray-400 leading-relaxed">
            Total and per-provider figures are a lifetime running tally that survives history cleanup and deletes.
          </p>
        </div>
      )}
    </div>
  );
};

export default SpendSummary;
