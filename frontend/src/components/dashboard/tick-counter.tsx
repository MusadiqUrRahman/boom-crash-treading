'use client';

import { motion } from 'framer-motion';
import { useBotStore } from '@/stores/bot-store';
import { timeAgo } from '@/lib/format';
import { Activity } from 'lucide-react';

export function TickCounter() {
  const tickIndex = useBotStore((s) => s.tickIndex);
  const lastTick = useBotStore((s) => s.lastTick);
  const indicatorsReady = useBotStore((s) => s.indicatorsReady);
  const state = useBotStore((s) => s.state);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.45 }}
      className="glass-card rounded-2xl p-4"
    >
      <div className="flex items-center gap-2.5 mb-4">
        <div className={`p-2 rounded-lg ${state === 'COLLECTING' ? 'bg-blue-500/10' : 'bg-[--color-bg-hover]'}`}>
          <Activity size={14} className={state === 'COLLECTING' ? 'text-blue-400' : 'text-[--color-text-muted]'} />
        </div>
        <span className="text-[10px] font-semibold text-[--color-text-muted] uppercase tracking-wider">Tick Data</span>
      </div>
      <div className="space-y-2.5">
        <div className="flex justify-between items-center">
          <span className="text-[11px] text-[--color-text-muted]">Processed</span>
          <motion.span
            key={tickIndex}
            initial={{ y: -4, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="font-mono text-sm font-bold text-[--color-text-primary] tabular-nums"
          >
            {tickIndex.toLocaleString()}
          </motion.span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-[11px] text-[--color-text-muted]">Last Tick</span>
          <span className="font-mono text-xs text-[--color-text-primary]">
            {lastTick ? timeAgo(lastTick.epoch) : '---'}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-[11px] text-[--color-text-muted]">Last Price</span>
          <motion.span
            key={lastTick?.quote}
            initial={{ scale: 1.1 }}
            animate={{ scale: 1 }}
            className="font-mono text-sm font-bold text-[--color-text-primary] tabular-nums"
          >
            {lastTick ? lastTick.quote.toFixed(2) : '---'}
          </motion.span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-[11px] text-[--color-text-muted]">Indicators</span>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
            indicatorsReady
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
          }`}>
            <span className={`relative flex h-2 w-2 ${indicatorsReady ? '' : ''}`}>
              {indicatorsReady ? (
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              ) : (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              )}
              <span className={`relative inline-flex rounded-full h-2 w-2 ${indicatorsReady ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            </span>
            {indicatorsReady ? 'Ready' : 'Warming'}
          </span>
        </div>
      </div>
    </motion.div>
  );
}
