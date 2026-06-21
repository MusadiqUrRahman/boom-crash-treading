'use client';

import { useEffect, useState } from 'react';
import { useBotStore } from '@/stores/bot-store';
import { formatPnL } from '@/lib/format';
import { TrendingUp, TrendingDown, BarChart3, Crosshair, Target } from 'lucide-react';
import { StatsCard } from '@/components/dashboard/stats-card';
import { motion } from 'framer-motion';

export function TodayStats() {
  const todayStats = useBotStore((s) => s.todayStats);
  const [sparklineData, setSparklineData] = useState<number[]>([]);

  useEffect(() => {
    if (todayStats?.today) {
      Promise.resolve().then(() => {
        setSparklineData(prev => {
          if (prev.length > 0 && prev[prev.length - 1] === todayStats.today.pnl) return prev;
          return [...prev, todayStats.today.pnl].slice(-20);
        });
      });
    }
  }, [todayStats?.today?.trades]);

  if (!todayStats?.today || todayStats.today.trades === 0) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {['Today PnL', 'Trades', 'Win Rate', 'Avg PnL'].map((label, i) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, duration: 0.3 }}
            className="glass-card rounded-xl p-4 animate-pulse"
          >
            <div className="h-2.5 w-16 bg-[--color-bg-hover] rounded mb-3" />
            <div className="h-7 w-20 bg-[--color-bg-hover] rounded" />
          </motion.div>
        ))}
      </div>
    );
  }

  const totalTrades = todayStats.today.trades;
  const totalWins = todayStats.today.wins;
  const totalLosses = todayStats.today.losses;
  const totalPnl = todayStats.today.pnl;
  const winRate = totalTrades > 0 ? Math.round((totalWins / totalTrades) * 100) : 0;
  const avgPnl = totalTrades > 0 ? totalPnl / totalTrades : 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="grid grid-cols-2 md:grid-cols-4 gap-3"
    >
      <StatsCard
        title="Today PnL"
        value={formatPnL(totalPnl)}
        subtitle={totalPnl >= 0 ? 'Profit' : 'Loss'}
        icon={totalPnl >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
        trend={totalPnl >= 0 ? 'up' : 'down'}
        trendLabel={`${totalPnl >= 0 ? '+' : ''}${totalPnl >= 0 ? 'Positive' : 'Negative'}`}
        accentColor={totalPnl >= 0 ? 'emerald' : 'red'}
        delay={0}
        sparklineData={sparklineData.length > 1 ? sparklineData : undefined}
        previousValue={`${totalTrades} trades`}
      />
      <StatsCard
        title="Trades"
        value={totalTrades.toString()}
        subtitle={`${totalWins}W / ${totalLosses}L`}
        icon={<Crosshair size={14} />}
        accentColor="blue"
        delay={1}
      />
      <StatsCard
        title="Win Rate"
        value={`${winRate}%`}
        subtitle={`${totalWins}W / ${totalLosses}L`}
        icon={<Target size={14} />}
        trend={winRate >= 50 ? 'up' : 'down'}
        trendLabel={`${winRate >= 50 ? '+ ' : ''}${Math.abs(winRate - 50)}%`}
        accentColor={winRate >= 50 ? 'emerald' : 'red'}
        delay={2}
      />
      <StatsCard
        title="Avg PnL"
        value={formatPnL(avgPnl)}
        subtitle="Per trade"
        icon={<BarChart3 size={14} />}
        trend={avgPnl >= 0 ? 'up' : 'down'}
        accentColor={avgPnl >= 0 ? 'blue' : 'red'}
        delay={3}
      />
    </motion.div>
  );
}
