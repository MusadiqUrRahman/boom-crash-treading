'use client';

import { motion } from 'framer-motion';
import { useBotStore } from '@/stores/bot-store';
import { Clock } from 'lucide-react';

export function HourlyBreakdown() {
  const todayStats = useBotStore((s) => s.todayStats);

  if (!todayStats || Object.keys(todayStats.hourly).length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card rounded-2xl p-5"
      >
        <div className="flex items-center gap-2.5 mb-4">
          <div className="p-2 rounded-lg bg-blue-500/10">
            <Clock size={15} className="text-blue-400" />
          </div>
          <span className="text-[11px] font-semibold text-[--color-text-muted] uppercase tracking-wider">Hourly Breakdown</span>
        </div>
        <div className="flex items-center justify-center h-20 text-xs text-[--color-text-muted]">
          No trades yet today
        </div>
      </motion.div>
    );
  }

  const maxTrades = Math.max(1, ...Object.values(todayStats.hourly).map((h) => h.trades));
  const now = new Date();
  const currentHour = now.getUTCHours();
  const hasAnyTrades = Object.values(todayStats.hourly).some((h) => h.trades > 0);

  if (!hasAnyTrades) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card rounded-2xl p-5"
      >
        <div className="flex items-center gap-2.5 mb-4">
          <div className="p-2 rounded-lg bg-blue-500/10">
            <Clock size={15} className="text-blue-400" />
          </div>
          <span className="text-[11px] font-semibold text-[--color-text-muted] uppercase tracking-wider">Hourly Breakdown</span>
        </div>
        <div className="flex items-center justify-center h-20 text-xs text-[--color-text-muted]">
          No trades yet today
        </div>
      </motion.div>
    );
  }

  const totalToday = Object.values(todayStats.hourly).reduce((s, h) => s + h.trades, 0);
  const totalWins = Object.values(todayStats.hourly).reduce((s, h) => s + h.wins, 0);
  const totalPnl = Object.values(todayStats.hourly).reduce((s, h) => s + h.pnl, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2 }}
      className="glass-card rounded-2xl p-5"
    >
      <div className="flex items-center gap-2.5 mb-5">
        <div className="p-2 rounded-lg bg-blue-500/10">
          <Clock size={15} className="text-blue-400" />
        </div>
        <span className="text-[11px] font-semibold text-[--color-text-muted] uppercase tracking-wider">Hourly Breakdown</span>
        <div className="flex items-center gap-3 ml-auto text-[10px] font-mono">
          <span className="text-[--color-text-muted]">{totalToday} trades</span>
          <span className="text-emerald-400">{totalWins}W</span>
          <span className="text-red-400">{totalToday - totalWins}L</span>
          <span className={totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}>
            {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-1.5 items-end">
        {Array.from({ length: 24 }, (_, h) => h).map((h) => {
          const stat = todayStats.hourly[h];
          if (!stat || stat.trades === 0) {
            return (
              <div key={h} className="flex flex-col items-center gap-1.5 group" style={{ height: 60 }}>
                <div className="flex-1 w-full flex items-end">
                  <div className="w-full h-[2px] bg-[--color-bg-active] rounded-full" />
                </div>
                <span className="text-[9px] text-[--color-text-muted] font-mono">
                  {h.toString().padStart(2, '0')}
                </span>
              </div>
            );
          }

          const pct = (stat.trades / maxTrades) * 100;
          const barH = Math.max(pct * 1.5, 8);
          const wr = (stat.wins / stat.trades) * 100;
          const isCurrent = h === currentHour;
          const isPositive = wr >= 50;
          const barColor = isCurrent
            ? 'linear-gradient(180deg, #60a5fa 0%, #3b82f6 40%, rgba(59,130,246,0.3) 100%)'
            : isPositive
              ? 'linear-gradient(180deg, #34d399 0%, #22c55e 40%, rgba(34,197,94,0.2) 100%)'
              : 'linear-gradient(180deg, #f87171 0%, #ef4444 40%, rgba(239,68,68,0.2) 100%)';

          return (
            <div key={h} className="flex flex-col items-center gap-1.5 group relative" style={{ height: 60 }}>
              <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-[--color-bg-elevated] border border-[--color-border] rounded-xl px-3 py-2 text-[10px] opacity-0 group-hover:opacity-100 transition-all duration-200 whitespace-nowrap z-20 pointer-events-none shadow-2xl backdrop-blur-xl">
                <div className="font-semibold text-[--color-text-primary] mb-1">Hour {h}:00</div>
                <div className="text-[--color-text-muted]">{stat.trades} trades ({stat.wins}W / {stat.losses}L)</div>
                <div className={stat.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                  {stat.pnl >= 0 ? '+' : ''}${stat.pnl.toFixed(2)}
                </div>
              </div>
              <div className="flex-1 w-full flex items-end">
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${barH}px` }}
                  transition={{ duration: 0.6, delay: h * 0.015, ease: 'easeOut' }}
                  className="w-full rounded-t-md transition-all duration-500 group-hover:opacity-80"
                  style={{
                    background: barColor,
                    boxShadow: isCurrent ? '0 0 12px rgba(59,130,246,0.3)' : 'none',
                  }}
                />
              </div>
              <span className={`text-[9px] font-mono ${
                isCurrent ? 'text-blue-400 font-bold drop-shadow-[0_0_6px_rgba(59,130,246,0.5)]' : 'text-[--color-text-muted]'
              }`}>
                {h.toString().padStart(2, '0')}
              </span>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
