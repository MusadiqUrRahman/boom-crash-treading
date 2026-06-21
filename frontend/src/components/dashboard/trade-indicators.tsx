'use client';

import { motion } from 'framer-motion';
import { useBotStore } from '@/stores/bot-store';

export function TradeIndicators() {
  const state = useBotStore((s) => s.state);
  const score = useBotStore((s) => s.score);
  const config = useBotStore((s) => s.config);

  const isCooldown = state === 'COOLDOWN';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.5 }}
      className="bg-[--color-bg-elevated] border border-[--color-border] rounded-lg p-3"
    >
      <div className="text-[11px] font-medium text-[--color-text-secondary] uppercase tracking-wider mb-2">Signal Info</div>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[--color-text-muted] uppercase">Score</span>
          <motion.span
            key={score?.total}
            initial={{ scale: 1.2 }}
            animate={{ scale: 1 }}
            className="font-mono text-lg font-bold text-[--color-text-primary]"
          >
            {score?.total?.toFixed(1) ?? '--'}
          </motion.span>
          {config && (
            <span className="text-[10px] text-[--color-text-muted]">/ {config.scoreThreshold}</span>
          )}
        </div>

        <div className="w-px h-6 bg-[--color-border]" />

        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[--color-text-muted] uppercase">Direction</span>
          {score?.direction ? (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              key={score.direction}
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                score.direction === 'CALL' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
              }`}>
              {score.direction}
            </motion.span>
          ) : (
            <span className="text-xs text-[--color-text-muted]">---</span>
          )}
        </div>

        <div className="w-px h-6 bg-[--color-border]" />

        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[--color-text-muted] uppercase">Decision</span>
          {score?.decision === 'ENTER' ? (
            <motion.span
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              className="text-[10px] font-bold text-green-500 uppercase flex items-center gap-1"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
              Enter
            </motion.span>
          ) : isCooldown ? (
            <span className="text-[10px] font-bold text-amber-400 uppercase">Cooldown</span>
          ) : (
            <span className="text-[10px] text-[--color-text-muted] uppercase">Skip</span>
          )}
        </div>

        <div className="w-px h-6 bg-[--color-border]" />

        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[--color-text-muted] uppercase">State</span>
          <span className="text-[10px] font-mono text-[--color-text-primary]">{state}</span>
        </div>
      </div>
    </motion.div>
  );
}
