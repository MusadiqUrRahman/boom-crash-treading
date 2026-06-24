'use client';

import { useBotStore } from '@/stores/bot-store';
import { Clock } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

export function HourlyBreakdown() {
  const todayStats = useBotStore((s) => s.todayStats);
  const [, forceUpdate] = useState(0);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hoveredHour, setHoveredHour] = useState<number | null>(null);
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

  if (!todayStats || Object.keys(todayStats.hourly).length === 0) {
    return (
      <div className="bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-lg px-3 py-2 flex items-center gap-2">
        <Clock size={11} className="text-blue-400" />
        <span className="text-[10px] font-semibold text-[--color-text-muted] uppercase tracking-wider">Hourly</span>
        <span className="text-[9px] text-[--color-text-muted]">No data</span>
      </div>
    );
  }

  const hourly = todayStats.hourly;
  const maxTrades = Math.max(1, ...Object.values(hourly).map(h => h.trades));
  const totalTrades = Object.values(hourly).reduce((s, h) => s + h.trades, 0);
  const totalWins = Object.values(hourly).reduce((s, h) => s + h.wins, 0);
  const totalPnl = Object.values(hourly).reduce((s, h) => s + h.pnl, 0);
  const hasAnyTrades = totalTrades > 0;

  const now = new Date();
  const currentHour = now.getHours();

  return (
    <div className="bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-lg px-3 py-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <Clock size={11} className="text-blue-400" />
          <span className="text-[10px] font-semibold text-[--color-text-muted] uppercase tracking-wider">Hourly</span>
          {hasAnyTrades && (
            <span className="text-[9px] font-mono text-[--color-text-muted]">
              {totalTrades}T {totalWins}W {totalTrades - totalWins}L
              <span className={`ml-1 ${totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)}
              </span>
            </span>
          )}
        </div>
      </div>

      {/* Compact bar strip */}
      <div className="flex items-end gap-px" style={{ height: 32 }}>
        {Array.from({ length: 24 }, (_, h) => h).map((h) => {
          const stat = hourly[h];
          const trades = stat?.trades ?? 0;
          const wins = stat?.wins ?? 0;
          const pnl = stat?.pnl ?? 0;
          const pct = maxTrades > 0 ? (trades / maxTrades) : 0;
          const barH = trades === 0 ? 1 : Math.max(pct * 28, 3);
          const wr = trades > 0 ? (wins / trades) * 100 : 0;
          const isCurrent = h === currentHour;
          const isHovered = hoveredHour === h;

          let barColor = 'var(--color-bg-active)';
          if (trades > 0) {
            if (isCurrent) barColor = '#3b82f6';
            else if (wr >= 50) barColor = '#22c55e';
            else barColor = '#ef4444';
          }

          return (
            <div
              key={h}
              className="flex-1 flex flex-col items-center justify-end relative"
              style={{ height: 32 }}
              onMouseEnter={() => setHoveredHour(h)}
              onMouseLeave={() => setHoveredHour(null)}
            >
              {/* Tooltip */}
              {isHovered && trades > 0 && (
                <div className="absolute -top-1 left-1/2 -translate-x-1/2 -translate-y-full bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded px-2 py-1 text-[8px] whitespace-nowrap z-20 shadow-lg">
                  <div className="font-bold text-[--color-text-primary]">{h}:00</div>
                  <div className="text-[--color-text-muted]">{trades}T {wins}W/{trades - wins}L</div>
                  <div className={pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                    {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                  </div>
                </div>
              )}
              {/* Bar */}
              <div
                className="w-full rounded-t-sm transition-all duration-200"
                style={{
                  height: barH,
                  backgroundColor: barColor,
                  opacity: isCurrent ? 1 : trades > 0 ? 0.7 : 0.2,
                  boxShadow: isCurrent ? '0 0 6px rgba(59,130,246,0.4)' : 'none',
                }}
              />
            </div>
          );
        })}
      </div>

      {/* Hour labels - only show every 4th */}
      <div className="flex gap-px mt-0.5">
        {Array.from({ length: 24 }, (_, h) => h).map((h) => (
          <div key={h} className="flex-1 text-center text-[7px] font-mono text-[--color-text-muted]">
            {h % 4 === 0 ? h.toString().padStart(2, '0') : ''}
          </div>
        ))}
      </div>
    </div>
  );
}
