'use client';

import { useRef, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useBotStore } from '@/stores/bot-store';
import { useWsStore } from '@/stores/ws-store';
import { formatDuration, timeAgoMs } from '@/lib/format';

const stateColors: Record<string, string> = {
  RUNNING: 'bg-green-500',
  ERROR: 'bg-red-500',
  STOPPED: 'bg-zinc-500',
  COOLDOWN: 'bg-amber-500',
  SKIP: 'bg-amber-500',
  STOPPING: 'bg-amber-500',
  CONNECTING: 'bg-amber-500',
  IN_POSITION: 'bg-blue-500',
  ENTERING: 'bg-blue-500',
  COLLECTING: 'bg-zinc-400',
  SCORING: 'bg-blue-500',
  DECISION: 'bg-blue-500',
  AUTHORIZED: 'bg-green-500',
  AUTHORIZING: 'bg-amber-500',
  DISCONNECTED: 'bg-zinc-500',
  INIT: 'bg-zinc-500',
  RESOLVING: 'bg-blue-500',
};

const connColors: Record<string, string> = {
  AUTHORIZED: 'text-green-500',
  CONNECTED: 'text-green-400',
  CONNECTING: 'text-amber-400',
  DISCONNECTED: 'text-red-400',
  ERROR: 'text-red-500',
};

function Divider() {
  return <div className="w-px h-5 bg-[--color-border] shrink-0" />;
}

export function StatusBar() {
  const state = useBotStore((s) => s.state);
  const connectionState = useBotStore((s) => s.connectionState);
  const tickIndex = useBotStore((s) => s.tickIndex);
  const session = useBotStore((s) => s.session);
  const config = useBotStore((s) => s.config);
  const lastTick = useBotStore((s) => s.lastTick);
  const lastMessageAt = useWsStore((s) => s.lastMessageAt);
  const isReconnecting = useWsStore((s) => s.isReconnecting);

  const [priceDir, setPriceDir] = useState<'up' | 'down' | null>(null);
  const prevPrice = useRef<number | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (lastTick && prevPrice.current !== null && prevPrice.current !== lastTick.quote) {
      const dir = lastTick.quote > prevPrice.current ? 'up' : 'down';
      setPriceDir(dir);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setPriceDir(null), 400);
    }
    if (lastTick) prevPrice.current = lastTick.quote;
    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, [lastTick]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center h-12 px-4 gap-2.5 text-xs border-b border-[--color-border] bg-[--color-bg] shrink-0 select-none"
    >
      <div className="flex items-center gap-2 min-w-[130px]">
        <span className="relative flex h-2.5 w-2.5">
          <span className={`inline-flex h-full w-full rounded-full ${stateColors[state] || 'bg-zinc-500'}`} data-state={state} />
        </span>
        <motion.span
          key={state}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="status-label font-semibold text-[--color-text-primary] tracking-widest uppercase"
        >
          {state}
        </motion.span>
      </div>

      <Divider />

      <span className="text-[--color-accent] font-semibold min-w-[70px] tabular-nums">
        {config?.symbol || '---'}
      </span>

      <Divider />

      {config && (
        <span
          className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
            config.dryRun
              ? 'bg-amber-500/20 text-amber-400'
              : 'bg-green-500/20 text-green-400'
          }`}
        >
          {config.dryRun ? 'DRY-RUN' : 'LIVE'}
        </span>
      )}

      <div className="flex-1 min-w-[8px]" />

      {config && (
        <span className="text-[--color-text-muted] flex items-center gap-1.5">
          Stake
          <span className="text-[--color-text-primary] font-mono tabular-nums w-[62px] inline-block text-right">
            ${config.stake.toFixed(2)}
          </span>
        </span>
      )}

      <Divider />

      <span className="text-[--color-text-muted] flex items-center gap-1.5">
        Ticks
        <span className="text-[--color-text-primary] font-mono tabular-nums w-[72px] inline-block text-right">
          {tickIndex.toLocaleString()}
        </span>
      </span>

      <Divider />

      <span className="text-[--color-text-muted] flex items-center gap-1.5 min-w-[90px]">
        Price
        <span
          className={`relative font-mono tabular-nums w-[68px] inline-block text-right transition-colors duration-200 ${
            priceDir === 'up'
              ? 'text-green-400'
              : priceDir === 'down'
                ? 'text-red-400'
                : 'text-[--color-text-primary]'
          }`}
        >
          {lastTick ? lastTick.quote.toFixed(2) : '---'}
          <span
            className={`absolute inset-0 rounded transition-opacity duration-300 pointer-events-none ${
              priceDir === 'up'
                ? 'bg-green-500/15 opacity-100'
                : priceDir === 'down'
                  ? 'bg-red-500/15 opacity-100'
                  : 'opacity-0'
            }`}
          />
        </span>
      </span>

      <Divider />

      <span
        className={`conn-state font-mono min-w-[100px] text-center ${connColors[connectionState] || 'text-zinc-500'}`}
        data-conn={isReconnecting ? 'CONNECTING' : connectionState}
      >
        {isReconnecting ? 'RECONNECTING' : connectionState}
      </span>

      <Divider />

      <span className="text-[--color-text-muted] font-mono tabular-nums min-w-[52px] text-center">
        {lastMessageAt ? timeAgoMs(lastMessageAt) : '--'}
      </span>

      <Divider />

      <span className="text-[--color-text-muted] font-mono tabular-nums min-w-[72px] text-center">
        {session ? formatDuration(session.sessionDuration) : '--'}
      </span>
    </motion.div>
  );
}
