'use client';

import { useMemo } from 'react';
import { useBotStore } from '@/stores/bot-store';
import { motion } from 'framer-motion';
import { Flame, Snowflake } from 'lucide-react';

export function StreakTracker() {
  const trades = useBotStore(s => s.trades);

  const streaks = useMemo(() => {
    const sorted = [...trades].sort((a, b) => (a.exitEpoch || 0) - (b.exitEpoch || 0));
    const history: ('W' | 'L')[] = sorted.map(t => t.win ? 'W' : 'L');

    let currentStreak = 0;
    let currentType: 'W' | 'L' | null = null;
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i] === currentType || currentType === null) {
        currentType = history[i];
        currentStreak++;
      } else break;
    }

    let maxW = 0, maxL = 0, streak = 0;
    let type: 'W' | 'L' | null = null;
    for (const r of history) {
      if (r === type) streak++;
      else { type = r; streak = 1; }
      if (type === 'W' && streak > maxW) maxW = streak;
      if (type === 'L' && streak > maxL) maxL = streak;
    }

    const recent = history.slice(-30);

    return { currentStreak, currentType, maxW, maxL, recent };
  }, [trades]);

  if (trades.length === 0) {
    return (
      <div className="bg-[--color-bg-elevated] border border-[--color-border] rounded-xl p-6">
        <p className="text-[11px] text-[--color-text-muted]">No trade data yet</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-[--color-bg-elevated] border border-[--color-border] rounded-xl p-4"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-semibold text-[--color-text-muted] uppercase tracking-wider">Streaks</span>
      </div>

      <div className="flex items-center gap-4 mb-3">
        <div className="flex items-center gap-2">
          {streaks.currentType === 'W' ? (
            <Flame size={16} className="text-orange-400" />
          ) : streaks.currentType === 'L' ? (
            <Snowflake size={16} className="text-blue-400" />
          ) : null}
          <span className="font-mono text-lg font-bold tabular-nums" style={{
            color: streaks.currentType === 'W' ? '#34d399' : streaks.currentType === 'L' ? '#f87171' : 'rgba(255,255,255,0.3)',
          }}>
            {streaks.currentStreak}
          </span>
          <span className="text-[10px] text-[--color-text-muted]">
            {streaks.currentType === 'W' ? 'win streak' : streaks.currentType === 'L' ? 'loss streak' : 'no trades'}
          </span>
        </div>
        <div className="w-px h-6 bg-[--color-border]" />
        <div className="text-[10px] text-[--color-text-muted]">
          Best: <span className="text-emerald-400 font-mono">{streaks.maxW}</span>W
          {' / '}
          Worst: <span className="text-red-400 font-mono">{streaks.maxL}</span>L
        </div>
      </div>

      <div className="flex gap-[2px] flex-wrap">
        {streaks.recent.map((r, i) => (
          <div
            key={i}
            className="w-[6px] h-[6px] rounded-sm"
            style={{
              background: r === 'W' ? '#34d399' : '#f87171',
              opacity: i === streaks.recent.length - 1 ? 1 : 0.5,
            }}
          />
        ))}
      </div>
      <div className="text-[9px] text-[--color-text-muted] mt-1">Last {streaks.recent.length} trades</div>
    </motion.div>
  );
}
