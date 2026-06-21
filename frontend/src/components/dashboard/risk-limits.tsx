'use client';

import { motion } from 'framer-motion';
import { useBotStore } from '@/stores/bot-store';
import { formatCurrency } from '@/lib/format';
import { ShieldAlert } from 'lucide-react';

function LimitBar({ label, value, max, format, delay = 0 }: {
  label: string; value: number; max: number; format?: (v: number) => string; delay?: number;
}) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const color = pct <= 60 ? 'bg-emerald-500' : pct <= 80 ? 'bg-amber-500' : 'bg-red-500';
  const glow = pct > 80 ? 'shadow-[0_0_8px_rgba(239,68,68,0.3)]' : '';

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-[10px]">
        <span className="text-[--color-text-muted]">{label}</span>
        <span className="font-mono text-[--color-text-secondary]">
          {format ? format(value) : value} / {format ? format(max) : max}
        </span>
      </div>
      <div className="h-2 bg-[--color-bg-active] rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, delay, ease: 'easeOut' }}
          className={`h-full rounded-full transition-all duration-700 ease-out ${color} ${glow}`}
        />
      </div>
    </div>
  );
}

export function RiskLimits() {
  const risk = useBotStore((s) => s.risk);
  const config = useBotStore((s) => s.config);

  if (!risk || !config) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card rounded-2xl p-4 animate-pulse"
      >
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 bg-[--color-bg-hover] rounded-lg" />
          <div className="h-3 w-20 bg-[--color-bg-hover] rounded" />
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i}>
              <div className="h-2.5 w-full bg-[--color-bg-hover] rounded" />
            </div>
          ))}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.35 }}
      className="glass-card rounded-2xl p-4"
    >
      <div className="flex items-center gap-2.5 mb-4">
        <div className="p-2 rounded-lg bg-amber-500/10">
          <ShieldAlert size={14} className="text-amber-400" />
        </div>
        <span className="text-[10px] font-semibold text-[--color-text-muted] uppercase tracking-wider">Risk Limits</span>
        <span className={`ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded ${
          risk.consecutiveLosses >= config.maxConsecutiveLosses
            ? 'bg-red-500/15 text-red-400'
            : 'bg-emerald-500/10 text-emerald-400'
        }`}>
          {risk.consecutiveLosses >= config.maxConsecutiveLosses ? 'STOPPED' : 'Active'}
        </span>
      </div>
      <div className="space-y-3.5">
        <LimitBar
          label="Consecutive Losses"
          value={risk.consecutiveLosses}
          max={config.maxConsecutiveLosses}
          delay={0.1}
        />
        <LimitBar
          label="Daily Loss"
          value={Math.abs(risk.dailyLoss)}
          max={config.maxDailyLoss}
          format={(v) => formatCurrency(v)}
          delay={0.2}
        />
        <LimitBar
          label="Daily Trades"
          value={risk.dailyTrades}
          max={config.maxDailyTrades}
          delay={0.3}
        />
      </div>
    </motion.div>
  );
}
