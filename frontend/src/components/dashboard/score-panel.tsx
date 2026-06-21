'use client';

import { motion } from 'framer-motion';
import { useBotStore } from '@/stores/bot-store';
import { BarChart3, TrendingUp, TrendingDown } from 'lucide-react';

export function ScorePanel() {
  const score = useBotStore((s) => s.score);
  const state = useBotStore((s) => s.state);

  if (score === null) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card rounded-2xl p-4"
      >
        <div className="flex items-center gap-2.5 mb-4">
          <div className="p-2 rounded-lg bg-[--color-bg-hover]">
            <BarChart3 size={14} className="text-[--color-text-muted]" />
          </div>
          <span className="text-[10px] font-semibold text-[--color-text-muted] uppercase tracking-wider">Score</span>
        </div>
        <div className="text-center py-2 text-[10px] text-[--color-text-muted]">
          No signals yet
        </div>
      </motion.div>
    );
  }

  const sv = score.total;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.4 }}
      className="glass-card rounded-2xl p-4"
    >
      <div className="flex items-center gap-2.5 mb-4">
        <div className={`p-2 rounded-lg ${sv >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
          <BarChart3 size={14} className={sv >= 0 ? 'text-emerald-400' : 'text-red-400'} />
        </div>
        <span className="text-[10px] font-semibold text-[--color-text-muted] uppercase tracking-wider">Score</span>
        <span className={`ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded ${
          state === 'SCORING'
            ? 'bg-blue-500/15 text-blue-400'
            : 'bg-[--color-bg-hover] text-[--color-text-muted]'
        }`}>
          {state === 'SCORING' ? 'Scoring...' : state}
        </span>
      </div>

      <div className="flex items-center gap-3 p-3 rounded-xl bg-[--color-bg-hover]/50">
        <div className={`p-2 rounded-lg ${sv >= 3 ? 'bg-blue-500/15' : ''}`}>
          {sv >= 3 ? (
            <TrendingUp size={18} className={sv >= 0 ? 'text-emerald-400' : 'text-red-400'} />
          ) : (
            <TrendingDown size={18} className="text-[--color-text-muted]" />
          )}
        </div>
        <div>
          <motion.div
            key={sv}
            initial={{ scale: 1.2 }}
            animate={{ scale: 1 }}
            className={`font-mono text-xl font-bold tabular-nums ${
              sv >= 3 ? 'text-emerald-400' : sv >= 0 ? 'text-amber-400' : 'text-red-400'
            }`}
          >
            {sv.toFixed(1)}
          </motion.div>
          <div className="text-[10px] text-[--color-text-muted]">
            {sv >= 5 ? 'Strong Signal' : sv >= 3 ? 'Moderate Signal' : sv >= 1 ? 'Weak Signal' : 'No Signal'}
          </div>
        </div>
      </div>

      {score.components && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="mt-3 pt-3 border-t border-[--color-border] space-y-1.5"
        >
          <div className="text-[9px] text-[--color-text-muted] uppercase tracking-wider font-semibold mb-1.5">Components</div>
          {Object.entries(score.components).map(([key, val]) => {
            const valNum = Number(val);
            const isPositive = valNum >= 0;
            return (
              <div key={key} className="flex items-center justify-between text-[10px]">
                <span className="text-[--color-text-muted] capitalize">{key}</span>
                <div className="flex items-center gap-1.5">
                  <div className="w-16 h-1.5 bg-[--color-bg-active] rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(Math.abs(valNum) * 20, 100)}%` }}
                      className={`h-full rounded-full ${isPositive ? 'bg-emerald-500' : 'bg-red-500'}`}
                    />
                  </div>
                  <span className={`font-mono w-6 text-right ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                    {isPositive ? '+' : ''}{valNum.toFixed(1)}
                  </span>
                </div>
              </div>
            );
          })}
        </motion.div>
      )}
    </motion.div>
  );
}
