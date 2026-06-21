'use client';

import { useMemo } from 'react';
import { useBotStore } from '@/stores/bot-store';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, DollarSign, Target, Percent, BarChart3, Trophy, AlertTriangle } from 'lucide-react';

interface ComputedMetrics {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnL: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  avgDuration: number;
  consecutiveWins: number;
  consecutiveLosses: number;
  sharpe: number;
}

function computeMetrics(trades: import('@/types').Trade[]): ComputedMetrics {
  if (trades.length === 0) {
    return {
      totalTrades: 0, wins: 0, losses: 0, winRate: 0, totalPnL: 0,
      avgWin: 0, avgLoss: 0, profitFactor: 0, maxDrawdown: 0, maxDrawdownPct: 0,
      avgDuration: 0, consecutiveWins: 0, consecutiveLosses: 0, sharpe: 0,
    };
  }

  const sorted = [...trades].sort((a, b) => (a.exitEpoch || 0) - (b.exitEpoch || 0));
  const wins = trades.filter(t => t.win);
  const losses = trades.filter(t => !t.win);
  const winRate = trades.length > 0 ? wins.length / trades.length : 0;
  const totalPnL = trades.reduce((s, t) => s + (t.pnl || 0), 0);
  const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + (t.pnl || 0), 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + (t.pnl || 0), 0)) / losses.length : 0;
  const grossProfit = wins.reduce((s, t) => s + (t.pnl || 0), 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + (t.pnl || 0), 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

  let peak = 0;
  let maxDrawdown = 0;
  let cumulative = 0;
  const returns: number[] = [];
  for (const t of sorted) {
    cumulative += (t.pnl || 0);
    if (cumulative > peak) peak = cumulative;
    const dd = peak - cumulative;
    if (dd > maxDrawdown) maxDrawdown = dd;
    returns.push(t.pnl || 0);
  }
  const maxDrawdownPct = peak > 0 ? (maxDrawdown / peak) * 100 : 0;

  const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const variance = returns.length > 0 ? returns.reduce((a, b) => a + Math.pow(b - avgReturn, 2), 0) / returns.length : 0;
  const stdDev = Math.sqrt(variance);
  const sharpe = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(trades.length) : 0;

  let streakW = 0, streakL = 0, maxCW = 0, maxCL = 0;
  for (const t of sorted) {
    if (t.win) { streakW++; streakL = 0; if (streakW > maxCW) maxCW = streakW; }
    else { streakL++; streakW = 0; if (streakL > maxCL) maxCL = streakL; }
  }

  const durations = trades.filter(t => t.durationTicks > 0).map(t => t.durationTicks);
  const avgDuration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

  return {
    totalTrades: trades.length, wins: wins.length, losses: losses.length,
    winRate, totalPnL, avgWin, avgLoss, profitFactor,
    maxDrawdown, maxDrawdownPct, avgDuration,
    consecutiveWins: maxCW, consecutiveLosses: maxCL, sharpe,
  };
}

const metricCards = [
  { key: 'totalPnL', label: 'Total PnL', icon: DollarSign, color: (v: number) => v >= 0 ? 'emerald' : 'red', format: (v: number) => `${v >= 0 ? '+' : ''}$${Math.abs(v).toFixed(2)}` },
  { key: 'winRate', label: 'Win Rate', icon: Target, color: () => 'blue', format: (v: number) => `${(v * 100).toFixed(1)}%` },
  { key: 'profitFactor', label: 'Profit Factor', icon: TrendingUp, color: (v: number) => v >= 1.5 ? 'emerald' : v >= 1 ? 'amber' : 'red', format: (v: number) => v === Infinity ? '∞' : v.toFixed(2) },
  { key: 'totalTrades', label: 'Total Trades', icon: BarChart3, color: () => 'blue', format: (v: number) => v.toLocaleString() },
  { key: 'avgWin', label: 'Avg Win', icon: Trophy, color: () => 'emerald', format: (v: number) => `$${v.toFixed(2)}` },
  { key: 'avgLoss', label: 'Avg Loss', icon: AlertTriangle, color: () => 'red', format: (v: number) => `$${v.toFixed(2)}` },
  { key: 'maxDrawdownPct', label: 'Max DD %', icon: TrendingDown, color: (v: number) => v < 10 ? 'emerald' : v < 25 ? 'amber' : 'red', format: (v: number) => `${v.toFixed(1)}%` },
  { key: 'sharpe', label: 'Sharpe', icon: Percent, color: (v: number) => v >= 1 ? 'emerald' : v >= 0.5 ? 'amber' : 'red', format: (v: number) => v.toFixed(2) },
];

export function PerformanceMetrics() {
  const trades = useBotStore(s => s.trades);
  const metrics = useMemo(() => computeMetrics(trades), [trades]);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
      {metricCards.map((card, i) => {
        const val = metrics[card.key as keyof ComputedMetrics] as number;
        const color = card.color(val);
        const colorMap: Record<string, string> = {
          emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
          red: 'text-red-400 bg-red-500/10 border-red-500/20',
          amber: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
          blue: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
        };
        return (
          <motion.div
            key={card.key}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03, duration: 0.3 }}
            className="bg-[--color-bg-elevated] border border-[--color-border] rounded-lg p-2.5"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] font-medium text-[--color-text-muted] uppercase tracking-wider">{card.label}</span>
              <card.icon size={11} className="text-[--color-text-muted]" />
            </div>
            <span className={`font-mono text-sm font-bold tabular-nums ${colorMap[color].split(' ')[0]}`}>
              {card.format(val)}
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}

export { computeMetrics };
export type { ComputedMetrics };
