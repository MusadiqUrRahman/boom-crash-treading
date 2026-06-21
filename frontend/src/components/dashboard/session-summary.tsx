'use client';

import { motion } from 'framer-motion';
import { useBotStore } from '@/stores/bot-store';
import { formatCurrency, formatPnL, formatDuration } from '@/lib/format';
import { TrendingUp, TrendingDown, Wallet, Gauge, Clock, Zap } from 'lucide-react';
import { StatsCard } from '@/components/dashboard/stats-card';

export function SessionSummary() {
  const session = useBotStore((s) => s.session);
  const risk = useBotStore((s) => s.risk);
  const state = useBotStore((s) => s.state);

  if (!session || !risk) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card rounded-xl p-4"
      >
        <div className="flex items-center gap-2 mb-4">
          <Gauge size={14} className="text-blue-400" />
          <span className="text-[10px] font-semibold text-[--color-text-muted] uppercase tracking-wider">Session</span>
          {state && <span className="text-[10px] font-mono text-blue-400 ml-auto">{state}</span>}
        </div>
        <div className="space-y-3 animate-pulse">
          {[1,2,3,4].map(i => <div key={i} className="h-4 bg-[--color-bg-hover] rounded" />)}
        </div>
      </motion.div>
    );
  }

  const isActive = state === 'IN_POSITION' || state === 'COLLECTING' || state === 'SCORING';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.15 }}
      className="glass-card rounded-xl p-4"
    >
      <div className="flex items-center gap-2 mb-4">
        <div className={`p-1.5 rounded-lg ${isActive ? 'bg-emerald-500/10' : 'bg-[--color-bg-hover]'}`}>
          <Gauge size={14} className={isActive ? 'text-emerald-400' : 'text-[--color-text-muted]'} />
        </div>
        <span className="text-[10px] font-semibold text-[--color-text-muted] uppercase tracking-wider">Session</span>
        <div className="ml-auto flex items-center gap-1.5">
          {isActive && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
          )}
          <span className={`text-[10px] font-mono font-bold ${isActive ? 'text-emerald-400' : 'text-[--color-text-muted]'}`}>
            {state}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <StatsCard
          title="PnL"
          value={formatPnL(session.totalPnL)}
          subtitle={`${session.wins}W / ${session.losses}L`}
          icon={session.totalPnL >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
          trend={session.totalPnL >= 0 ? 'up' : 'down'}
          accentColor={session.totalPnL >= 0 ? 'emerald' : 'red'}
          animate={false}
        />
        <StatsCard
          title="Win Rate"
          value={`${session.winRate}%`}
          subtitle={`${session.trades} trades`}
          icon={<Zap size={13} />}
          trend={parseFloat(session.winRate) >= 50 ? 'up' : 'down'}
          accentColor={parseFloat(session.winRate) >= 50 ? 'emerald' : 'red'}
          animate={false}
        />
        <StatsCard
          title="Balance"
          value={formatCurrency(risk.balance)}
          subtitle={`Start: ${formatCurrency(risk.balance - session.totalPnL)}`}
          icon={<Wallet size={13} />}
          trend={risk.balance > 0 ? 'up' : 'down'}
          accentColor={risk.balance > 0 ? 'emerald' : 'red'}
          animate={false}
        />
        <StatsCard
          title="Duration"
          value={formatDuration(session.sessionDuration)}
          subtitle={`DD: ${risk.drawdownPct}%`}
          icon={<Clock size={13} />}
          trend={risk.drawdown > 0 ? 'down' : 'up'}
          accentColor={risk.drawdown > 0 ? 'red' : 'emerald'}
          animate={false}
        />
      </div>

      {session.trades > 0 && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="mt-3 pt-3 border-t border-[--color-border] grid grid-cols-2 gap-2 text-[10px]"
        >
          <div className="text-[--color-text-muted]">
            Profit Factor: <span className="font-mono text-[--color-text-primary]">{session.profitFactor}</span>
          </div>
          <div className="text-[--color-text-muted]">
            Max DD: <span className="font-mono text-red-400">{session.maxDrawdown}%</span>
          </div>
          <div className="text-[--color-text-muted]">
            Consec Wins: <span className="font-mono text-emerald-400">{session.consecutiveWins}</span>
          </div>
          <div className="text-[--color-text-muted]">
            Consec Losses: <span className="font-mono text-red-400">{session.consecutiveLosses}</span>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
