'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useWsStore } from '@/stores/ws-store';
import { useBotStore } from '@/stores/bot-store';
import { PriceChart } from '@/components/dashboard/price-chart';
import { SessionSummary } from '@/components/dashboard/session-summary';
import { TodayStats } from '@/components/dashboard/today-stats';
import { HourlyBreakdown } from '@/components/dashboard/hourly-breakdown';
import { TradeHistory } from '@/components/dashboard/trade-history';
import { SignalHistory } from '@/components/dashboard/signal-history';
import { ScorePanel } from '@/components/dashboard/score-panel';
import { ActiveContract } from '@/components/dashboard/active-contract';
import { RiskLimits } from '@/components/dashboard/risk-limits';
import { TickCounter } from '@/components/dashboard/tick-counter';
import { TradeIndicators } from '@/components/dashboard/trade-indicators';
import { ChartSkeleton } from '@/components/dashboard/loading-states';
import { formatCurrency } from '@/lib/format';
import {
  Wifi, WifiOff, Activity, Wallet, Clock, Timer, Box, Zap,
} from 'lucide-react';

export default function DashboardPage() {
  const isConnected = useWsStore((s) => s.isConnected);
  const isReconnecting = useWsStore((s) => s.isReconnecting);


  const state = useBotStore((s) => s.state);
  const tickIndex = useBotStore((s) => s.tickIndex);
  const activeContract = useBotStore((s) => s.activeContract);
  const activeContracts = useBotStore((s) => s.activeContracts);
  const risk = useBotStore((s) => s.risk);
  const session = useBotStore((s) => s.session);

  const [time, setTime] = useState('');

  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString('en-US', { hour12: false }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const connectionColor = !isConnected ? 'red' : isReconnecting ? 'amber' : 'emerald';
  const connectionLabel = !isConnected ? 'Disconnected' : isReconnecting ? 'Reconnecting' : 'Connected';
  const showState = state && state !== 'AUTHORIZED';

  if (!isConnected) {
    return (
      <div className="space-y-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-3"
        >
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-[--color-bg-elevated] border border-[--color-border] rounded-xl p-4 animate-pulse">
              <div className="w-10 h-10 bg-[--color-bg-hover] rounded-lg mb-3" />
              <div className="h-5 w-24 bg-[--color-bg-hover] rounded mb-2" />
              <div className="h-3 w-16 bg-[--color-bg-hover] rounded" />
            </div>
          ))}
        </motion.div>
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <div className="lg:col-span-3"><ChartSkeleton /></div>
          <div className="lg:col-span-1">
            <div className="bg-[--color-bg-elevated] border border-[--color-border] rounded-xl p-4 animate-pulse">
              <div className="space-y-3">
                {[1,2,3,4].map(i => <div key={i} className="h-4 bg-[--color-bg-hover] rounded" />)}
              </div>
            </div>
          </div>
        </div>
        <div className="bg-[--color-bg-elevated] border border-[--color-border] rounded-xl p-4 animate-pulse">
          <div className="h-4 w-32 bg-[--color-bg-hover] rounded mb-4" />
          <div className="flex gap-2">
            {Array.from({length: 24}).map((_, i) => <div key={i} className="h-12 flex-1 bg-[--color-bg-hover] rounded" />)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Status bar */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card rounded-xl px-4 py-2.5 flex items-center gap-4 text-[11px]"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
            connectionColor === 'emerald'
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
              : connectionColor === 'amber'
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                : 'bg-red-500/10 text-red-400 border border-red-500/20'
          }`}>
            <span className={`relative flex h-1.5 w-1.5 ${connectionColor === 'emerald' || connectionColor === 'amber' ? '' : ''}`}>
              {isConnected ? (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              ) : null}
              <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${
                connectionColor === 'emerald' ? 'bg-emerald-400'
                : connectionColor === 'amber' ? 'bg-amber-400'
                : 'bg-red-400'
              }`} />
            </span>
            {isConnected ? <Wifi size={10} /> : <WifiOff size={10} />}
            {connectionLabel}
          </span>
        </div>

        <div className="w-px h-5 bg-[--color-border]" />

        {showState && (
          <>
            <div className="flex items-center gap-1.5 text-[--color-text-muted]">
              <Zap size={10} />
              <motion.span
                key={state}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="font-mono font-bold"
                style={{
                  color: state === 'COLLECTING'
                    ? 'var(--color-win)' : state === 'ERROR'
                      ? 'var(--color-error)' : state === 'IN_POSITION' || state === 'RESOLVING'
                        ? 'var(--color-info)' : 'var(--color-warning)'
                }}
              >
                {state}
              </motion.span>
            </div>
            <div className="w-px h-5 bg-[--color-border]" />
          </>
        )}

        <div className="flex items-center gap-1.5 text-[--color-text-muted]">
          <Wallet size={10} />
          <span className="font-mono tabular-nums text-[--color-text-primary]">
            {risk ? formatCurrency(risk.balance) : '---'}
          </span>
        </div>

        <div className="w-px h-5 bg-[--color-border]" />

        <div className="flex items-center gap-1.5 text-[--color-text-muted]">
          <Activity size={10} />
          <span className="font-mono tabular-nums text-[--color-text-primary]">{tickIndex.toLocaleString()}</span>
          <span className="text-[9px]">ticks</span>
        </div>

        <div className="w-px h-5 bg-[--color-border]" />

        <div className="flex items-center gap-1.5 text-[--color-text-muted]">
          <Box size={10} />
          <span className="font-mono tabular-nums text-[--color-text-primary]">{activeContracts}</span>
          <span className="text-[9px]">active</span>
        </div>

        <div className="w-px h-5 bg-[--color-border]" />

        {session && (
          <>
            <div className="flex items-center gap-1.5 text-[--color-text-muted]">
              <Timer size={10} />
              <span className="font-mono tabular-nums text-[--color-text-primary]">{session.trades}</span>
              <span className="text-[9px]">trades</span>
            </div>
            <div className="w-px h-5 bg-[--color-border]" />
          </>
        )}

        <div className="flex items-center gap-1.5 ml-auto text-[--color-text-muted]">
          <Clock size={10} />
          <span className="font-mono tabular-nums text-[--color-text-primary]">{time}</span>
        </div>
      </motion.div>

      <TodayStats />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3">
          <PriceChart />
        </div>
        <div className="lg:col-span-1 space-y-4">
          <SessionSummary />
          {activeContract !== null && <ActiveContract />}
        </div>
      </div>

      <HourlyBreakdown />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <TradeHistory />
        <SignalHistory />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <ScorePanel />
        <RiskLimits />
        <TickCounter />
        <TradeIndicators />
      </div>

      {/* Live activity indicator footer */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
        className="flex items-center justify-center gap-2 text-[9px] text-[--color-text-muted] py-2"
      >
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
        </span>
        Live — Data refreshes every 2 seconds from backend
      </motion.div>
    </div>
  );
}
