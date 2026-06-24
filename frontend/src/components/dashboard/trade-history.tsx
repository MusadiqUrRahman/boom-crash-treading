'use client';

import { useBotStore } from '@/stores/bot-store';
import { formatPnL, formatDuration } from '@/lib/format';
import { ArrowUpRight, ArrowDownRight, Activity, ChevronRight } from 'lucide-react';
import { useState, useMemo, useEffect, useRef, useCallback } from 'react';

// Parse local time string "YYYY-MM-DD HH:MM:SS" to epoch ms (treating as local time)
function parseLocal(dateStr: string): number {
  const [datePart, timePart] = dateStr.split(' ');
  const [y, m, d] = datePart.split('-').map(Number);
  const [h, min, s] = (timePart || '00:00:00').split(':').map(Number);
  return new Date(y, m - 1, d, h, min, s).getTime();
}

function isToday(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const tradeTime = parseLocal(dateStr);
  const now = new Date();
  return now.getFullYear() === new Date(tradeTime).getFullYear()
    && now.getMonth() === new Date(tradeTime).getMonth()
    && now.getDate() === new Date(tradeTime).getDate();
}

export function TradeHistory() {
  const trades = useBotStore((s) => s.trades);
  const isInitialLoad = useBotStore((s) => s.isInitialLoad);
  const [filter, setFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [, forceUpdate] = useState(0);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const scheduleReset = () => {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      timerRef.current = setTimeout(() => { forceUpdate(n => n + 1); scheduleReset(); }, midnight.getTime() - now.getTime());
    };
    scheduleReset();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const todayTrades = useMemo(() => {
    return trades.filter(t => isToday(t.createdAt ?? null));
  }, [trades]);

  const filtered = useMemo(() => {
    if (!filter) return todayTrades;
    const f = filter.toLowerCase();
    return todayTrades.filter(t =>
      t.direction.toLowerCase().includes(f) ||
      t.exitReason?.toLowerCase().includes(f)
    );
  }, [todayTrades, filter]);

  const recent = filtered.slice(0, 50);
  const totalPnL = todayTrades.reduce((s, t) => s + (t.pnl || 0), 0);
  const wins = todayTrades.filter(t => t.win).length;
  const losses = todayTrades.length - wins;
  const winRate = todayTrades.length > 0 ? ((wins / todayTrades.length) * 100).toFixed(0) : '---';

  const toggleExpand = useCallback((key: string) => {
    setExpandedId(prev => prev === key ? null : key);
  }, []);

  if (!isInitialLoad) {
    return (
      <div className="bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-lg p-3">
        <div className="flex items-center gap-2 mb-2">
          <Activity size={12} className="text-blue-400" />
          <span className="text-[10px] font-semibold text-[--color-text-muted] uppercase tracking-wider">Trades</span>
        </div>
        <div className="flex items-center justify-center py-6">
          <div className="w-3 h-3 border-2 border-blue-500/30 border-t-blue-400 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-lg">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2">
          <Activity size={11} className="text-blue-400" />
          <span className="text-[10px] font-semibold text-[--color-text-muted] uppercase tracking-wider">Trades</span>
          <span className="text-[9px] text-[--color-text-muted] font-mono">{todayTrades.length}</span>
        </div>
        <div className="flex items-center gap-2.5 text-[9px] font-mono tabular-nums">
          {todayTrades.length > 0 && (
            <>
              <span className="text-emerald-400">{wins}W</span>
              <span className="text-red-400">{losses}L</span>
              <span className="text-[--color-text-muted]">{winRate}%</span>
              <span className={`font-bold ${totalPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatPnL(totalPnL)}</span>
            </>
          )}
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="filter"
            className="w-14 text-[9px] bg-[--color-bg-hover] border border-[--color-border] rounded px-1.5 py-0.5 text-[--color-text-primary] placeholder:text-[--color-text-muted] outline-none focus:border-blue-500/50"
          />
        </div>
      </div>

      {/* Table */}
      {recent.length === 0 ? (
        <div className="flex items-center justify-center py-6 text-[10px] text-[--color-text-muted]">
          {todayTrades.length === 0 ? 'No trades today' : 'No matches'}
        </div>
      ) : (
        <div className="max-h-[280px] overflow-y-auto scrollbar-thin">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="text-[--color-text-muted] border-b border-[var(--color-border)] sticky top-0 z-10 bg-[var(--color-bg-elevated)]">
                <th className="text-left py-1 px-3 font-medium text-[8px] uppercase tracking-wider w-5"></th>
                <th className="text-left py-1 font-medium text-[8px] uppercase tracking-wider">Time</th>
                <th className="text-center py-1 font-medium text-[8px] uppercase tracking-wider">Dir</th>
                <th className="text-right py-1 font-medium text-[8px] uppercase tracking-wider">Entry</th>
                <th className="text-right py-1 font-medium text-[8px] uppercase tracking-wider">Exit</th>
                <th className="text-right py-1 font-medium text-[8px] uppercase tracking-wider">PnL</th>
                <th className="text-center py-1 font-medium text-[8px] uppercase tracking-wider">Dur</th>
                <th className="text-center py-1 px-3 font-medium text-[8px] uppercase tracking-wider">Result</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((t) => {
                const isExpanded = expandedId === t._key;
                return (
                  <TradeRow key={t._key} trade={t} isExpanded={isExpanded} onToggle={() => toggleExpand(t._key)} />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TradeRow({ trade: t, isExpanded, onToggle }: { trade: any; isExpanded: boolean; onToggle: () => void }) {
  return (
    <>
      <tr
        onClick={onToggle}
        className={`border-b border-[var(--color-border)]/10 cursor-pointer transition-colors ${
          isExpanded ? 'bg-blue-500/[0.06]' : 'hover:bg-blue-500/[0.03]'
        }`}
      >
        <td className="py-1 px-3 text-center">
          <ChevronRight size={9} className={`text-[--color-text-muted] transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
        </td>
        <td className="py-1 font-mono text-[--color-text-muted] whitespace-nowrap">
          {t.createdAt ? new Date(t.createdAt).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '---'}
        </td>
        <td className="py-1 text-center">
          <span className={`inline-flex items-center gap-0.5 font-mono font-bold ${
            t.direction === 'CALL' ? 'text-emerald-400' : 'text-red-400'
          }`}>
            {t.direction === 'CALL' ? <ArrowUpRight size={9} /> : <ArrowDownRight size={9} />}
            {t.direction === 'CALL' ? 'C' : 'P'}
          </span>
        </td>
        <td className="py-1 text-right font-mono tabular-nums">{t.entryPrice?.toFixed(2) ?? '---'}</td>
        <td className="py-1 text-right font-mono tabular-nums">{t.exitPrice != null ? Number(t.exitPrice).toFixed(2) : '---'}</td>
        <td className={`py-1 text-right font-mono font-bold tabular-nums ${t.win ? 'text-emerald-400' : 'text-red-400'}`}>
          {formatPnL(t.pnl)}
        </td>
        <td className="py-1 text-center font-mono text-[--color-text-muted] tabular-nums">
          {t.entryEpoch && t.exitEpoch ? formatDuration(Math.round(t.exitEpoch - t.entryEpoch)) : '---'}
        </td>
        <td className="py-1 px-3 text-center">
          <span className={`inline-flex items-center px-1 py-0.5 rounded text-[8px] font-bold ${
            t.exitReason === 'take_profit' ? 'text-emerald-400 bg-emerald-500/10'
            : t.exitReason === 'stop_loss' ? 'text-red-400 bg-red-500/10'
            : t.exitReason === 'timeout' ? 'text-amber-400 bg-amber-500/10'
            : t.exitReason === 'win' ? 'text-emerald-400 bg-emerald-500/5'
            : t.exitReason === 'loss' ? 'text-red-400 bg-red-500/5'
            : 'text-[--color-text-muted] bg-[--color-bg-active]/50'
          }`}>
            {t.exitReason === 'take_profit' ? 'TP'
            : t.exitReason === 'stop_loss' ? 'SL'
            : t.exitReason === 'timeout' ? 'TO'
            : t.exitReason === 'MANUAL_SELL_SOLD' ? 'MAN'
            : t.exitReason === 'ALREADY_SOLD' ? 'SOLD'
            : t.exitReason === 'TICK_RESOLVED' ? 'TICK'
            : t.exitReason ? t.exitReason.slice(0, 4).toUpperCase() : '---'}
          </span>
        </td>
      </tr>
      {isExpanded && (
        <tr className="border-b border-[var(--color-border)]/10">
          <td colSpan={8} className="px-3 py-2 bg-[var(--color-bg-hover)]/30">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1.5 text-[9px]">
              <Detail label="Contract ID" value={t.contractId ?? '---'} />
              <Detail label="Symbol" value={t.symbol} />
              <Detail label="Stake" value={`$${t.stake}`} />
              <Detail label="Payout Rate" value={t.payoutRate ? `${(t.payoutRate * 100).toFixed(0)}%` : '---'} />
              <Detail label="Entry Price" value={t.entryPrice?.toFixed(4) ?? '---'} />
              <Detail label="Exit Price" value={t.exitPrice != null ? Number(t.exitPrice).toFixed(4) : '---'} />
              <Detail label="Duration" value={t.entryEpoch && t.exitEpoch ? formatDuration(Math.round(t.exitEpoch - t.entryEpoch)) : '---'} />
              <Detail label="Exit Reason" value={t.exitReason ?? '---'} />
              <Detail label="Score" value={t.score != null ? String(t.score) : '---'} />
              <Detail label="Contract Type" value={t.contractType ?? '---'} />
              <Detail label="Balance After" value={t.balanceAfter != null ? `$${t.balanceAfter.toFixed(2)}` : '---'} />
              <Detail label="Dry Run" value={t.dryRun ? 'Yes' : 'No'} />
              {t.scoreComponents && (
                <>
                  <Detail label="RSI" value={String(t.scoreComponents.rsi)} />
                  <Detail label="BB" value={String(t.scoreComponents.bb)} />
                  <Detail label="EMA" value={String(t.scoreComponents.ema)} />
                  <Detail label="ROC" value={String(t.scoreComponents.roc)} />
                  <Detail label="Momentum" value={String(t.scoreComponents.momentum)} />
                  <Detail label="Post-Spike" value={String(t.scoreComponents.postSpike)} />
                </>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[--color-text-muted]">{label}:</span>
      <span className="font-mono text-[--color-text-primary]">{value}</span>
    </div>
  );
}
