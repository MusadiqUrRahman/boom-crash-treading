'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useBotStore } from '@/stores/bot-store';
import { formatPnL, formatDuration } from '@/lib/format';
import { ListOrdered, TrendingUp, TrendingDown, Search } from 'lucide-react';
import { useState, useMemo } from 'react';

export function TradeHistory() {
  const trades = useBotStore((s) => s.trades);
  const isInitialLoad = useBotStore((s) => s.isInitialLoad);
  const [filter, setFilter] = useState<string>('');

  const filtered = useMemo(() => {
    if (!filter) return trades;
    const f = filter.toLowerCase();
    return trades.filter(t =>
      t.direction.toLowerCase().includes(f) ||
      t.symbol.toLowerCase().includes(f) ||
      t.exitReason?.toLowerCase().includes(f) ||
      t.pnl.toString().includes(f)
    );
  }, [trades, filter]);

  const recent = filtered.slice(0, 50);
  const totalPnL = recent.reduce((s, t) => s + (t.pnl || 0), 0);
  const wins = recent.filter((t) => t.win).length;

  if (!isInitialLoad) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card rounded-2xl p-4"
      >
        <div className="flex items-center gap-2 mb-3">
          <div className="p-1.5 rounded-lg bg-blue-500/10">
            <ListOrdered size={13} className="text-blue-400" />
          </div>
          <span className="text-[10px] font-semibold text-[--color-text-muted] uppercase tracking-wider">Recent Trades</span>
        </div>
        <div className="flex items-center justify-center py-8">
          <div className="flex flex-col items-center gap-2 text-xs text-[--color-text-muted]">
            <div className="w-4 h-4 border-2 border-blue-500/30 border-t-blue-400 rounded-full animate-spin" />
            <span>Loading trades...</span>
          </div>
        </div>
      </motion.div>
    );
  }

  if (trades.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card rounded-2xl p-4"
      >
        <div className="flex items-center gap-2 mb-3">
          <div className="p-1.5 rounded-lg bg-blue-500/10">
            <ListOrdered size={13} className="text-blue-400" />
          </div>
          <span className="text-[10px] font-semibold text-[--color-text-muted] uppercase tracking-wider">Recent Trades</span>
        </div>
        <div className="flex flex-col items-center justify-center py-8 text-xs text-[--color-text-muted]">
          <div className="mb-1">No trades yet</div>
          <div className="text-[10px]">Trades appear here when executed</div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.25 }}
      className="glass-card rounded-2xl p-4"
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="p-1.5 rounded-lg bg-blue-500/10">
          <ListOrdered size={13} className="text-blue-400" />
        </div>
        <span className="text-[10px] font-semibold text-[--color-text-muted] uppercase tracking-wider">Recent Trades</span>
        <div className="flex items-center gap-2 ml-auto">
          <div className="relative">
            <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-[--color-text-muted]" />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter..."
              className="w-24 text-[10px] bg-[--color-bg-hover] border border-[--color-border] rounded-md pl-6 pr-2 py-1 text-[--color-text-primary] placeholder:text-[--color-text-muted] outline-none"
            />
          </div>
          <div className="flex items-center gap-2.5 text-[10px] font-mono tabular-nums">
            <span className="text-[--color-text-muted]">{recent.length} total</span>
            <span className="flex items-center gap-0.5 text-emerald-400"><TrendingUp size={9} />{wins}W</span>
            <span className="flex items-center gap-0.5 text-red-400"><TrendingDown size={9} />{recent.length - wins}L</span>
            <span className={totalPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}>
              {totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)}
            </span>
          </div>
        </div>
      </div>
      <div className="max-h-[320px] overflow-y-auto -mx-4 px-4 scrollbar-thin">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-[--color-text-muted] border-b border-[--color-border] sticky top-0 z-10" style={{ background: 'var(--color-bg-elevated)' }}>
              <th className="text-left py-2 pr-1.5 font-medium text-[9px] uppercase tracking-wider w-[52px]">Time</th>
              <th className="text-left py-2 px-1.5 font-medium text-[9px] uppercase tracking-wider w-[32px]">Dir</th>
              <th className="text-right py-2 px-1.5 font-medium text-[9px] uppercase tracking-wider w-[48px]">Entry</th>
              <th className="text-right py-2 px-1.5 font-medium text-[9px] uppercase tracking-wider w-[48px]">Exit</th>
              <th className="text-right py-2 px-1.5 font-medium text-[9px] uppercase tracking-wider w-[48px]">PnL</th>
              <th className="text-center py-2 px-1.5 font-medium text-[9px] uppercase tracking-wider w-[44px]">Dur</th>
              <th className="text-center py-2 pl-1.5 font-medium text-[9px] uppercase tracking-wider w-[60px]">Exit</th>
            </tr>
          </thead>
          <tbody>
            <AnimatePresence initial={false}>
              {recent.map((t, idx) => (
                <motion.tr
                  key={t._key}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.2, delay: Math.min(idx * 0.02, 0.5) }}
                  className="border-b border-[--color-border]/10 hover:bg-blue-500/[0.02] transition-colors"
                >
                  <td className="py-2 pr-1.5 font-mono text-[--color-text-muted] text-[10px] whitespace-nowrap">
                    {t.createdAt ? new Date(t.createdAt).toLocaleTimeString('en-US', { hour12: false }) : '---'}
                  </td>
                  <td className={`py-2 px-1.5 font-mono font-bold text-[10px] ${
                    t.direction === 'CALL' ? 'text-emerald-400' : 'text-red-400'
                  }`}>
                    {t.direction === 'CALL' ? 'C' : 'P'}
                  </td>
                  <td className="py-2 px-1.5 font-mono text-right text-[10px] tabular-nums">{t.entryPrice?.toFixed(2) ?? '---'}</td>
                  <td className="py-2 px-1.5 font-mono text-right text-[10px] tabular-nums">{t.exitPrice != null ? Number(t.exitPrice).toFixed(2) : '---'}</td>
                  <td className={`py-2 px-1.5 font-mono text-right font-bold text-[10px] tabular-nums ${
                    t.win ? 'text-emerald-400' : 'text-red-400'
                  }`}>
                    <motion.span
                      key={t.pnl}
                      initial={{ scale: 1.3, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ duration: 0.3 }}
                    >
                      {formatPnL(t.pnl)}
                    </motion.span>
                  </td>
                  <td className="py-2 px-1.5 text-center font-mono text-[10px] text-[--color-text-muted] tabular-nums">
                    {t.entryEpoch && t.exitEpoch ? formatDuration(Math.round(t.exitEpoch - t.entryEpoch)) : '---'}
                  </td>
                  <td className="py-2 pl-1.5 text-center">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium ${
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
                      : t.exitReason ? t.exitReason.slice(0, 4) : '---'}
                    </span>
                  </td>
                </motion.tr>
              ))}
            </AnimatePresence>
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
