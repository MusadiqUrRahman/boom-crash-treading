'use client';

import { useMemo } from 'react';
import { useBotStore } from '@/stores/bot-store';
import { XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Area, AreaChart } from 'recharts';
import { motion } from 'framer-motion';

export function SignalPerformance() {
  const signals = useBotStore(s => s.signals);
  const signalStats = useBotStore(s => s.signalStats);

  const accuracyData = useMemo(() => {
    const resolved = signals.filter(s => s.resolved);
    if (resolved.length === 0) return [];

    const windowSize = Math.min(20, Math.max(5, Math.floor(resolved.length / 10)));
    const points: { label: string; accuracy: number; count: number }[] = [];
    for (let i = 0; i < resolved.length; i += windowSize) {
      const slice = resolved.slice(i, i + windowSize);
      const wins = slice.filter(s => s.outcome === 'WIN').length;
      points.push({
        label: `#${i + 1}`,
        accuracy: slice.length > 0 ? (wins / slice.length) * 100 : 0,
        count: slice.length,
      });
    }
    return points;
  }, [signals]);

  const scoreBuckets = useMemo(() => {
    const resolved = signals.filter(s => s.resolved && s.score != null);
    const buckets: Record<string, { total: number; wins: number }> = {};
    for (const s of resolved) {
      const bucket = Math.floor(s.score);
      const key = `${bucket}-${bucket + 1}`;
      if (!buckets[key]) buckets[key] = { total: 0, wins: 0 };
      buckets[key].total++;
      if (s.outcome === 'WIN') buckets[key].wins++;
    }
    return Object.entries(buckets)
      .map(([range, data]) => ({
        range,
        count: data.total,
        winRate: data.total > 0 ? (data.wins / data.total) * 100 : 0,
      }))
      .sort((a, b) => a.range.localeCompare(b.range));
  }, [signals]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-[--color-bg-elevated] border border-[--color-border] rounded-xl p-4"
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] font-semibold text-[--color-text-muted] uppercase tracking-wider">Signal Accuracy Over Time</span>
          {signalStats && (
            <span className="text-[10px] text-[--color-text-muted]">{signalStats.total} signals</span>
          )}
        </div>

        {accuracyData.length === 0 ? (
          <p className="text-[11px] text-[--color-text-muted] py-6 text-center">No resolved signals yet</p>
        ) : (
          <div className="h-[160px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={accuracyData} margin={{ top: 4, right: 4, bottom: 4, left: 0 }}>
                <defs>
                  <linearGradient id="accGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#60a5fa" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="label" tick={{ fontSize: 8, fill: 'rgba(255,255,255,0.3)' }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 8, fill: 'rgba(255,255,255,0.3)' }} tickFormatter={(v) => `${v}%`} width={32} />
                <Tooltip
                  contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 11 }}
                  formatter={(value) => [`${Number(value).toFixed(1)}%`, 'Accuracy'] as [string, string]}
                />
                <Area type="monotone" dataKey="accuracy" stroke="#60a5fa" strokeWidth={1.5} fill="url(#accGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="bg-[--color-bg-elevated] border border-[--color-border] rounded-xl p-4"
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] font-semibold text-[--color-text-muted] uppercase tracking-wider">Score Threshold Analysis</span>
        </div>

        {scoreBuckets.length === 0 ? (
          <p className="text-[11px] text-[--color-text-muted] py-6 text-center">No resolved signals yet</p>
        ) : (
          <div className="space-y-2">
            {scoreBuckets.map((bucket) => (
              <div key={bucket.range} className="flex items-center gap-2 text-[10px]">
                <span className="w-12 text-[--color-text-muted] font-mono">{bucket.range}</span>
                <div className="flex-1 h-3 bg-[--color-bg-hover] rounded-full overflow-hidden relative">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${bucket.winRate}%`,
                      background: bucket.winRate >= 50 ? '#34d399' : bucket.winRate >= 30 ? '#fbbf24' : '#f87171',
                    }}
                  />
                </div>
                <span className="w-10 text-right font-mono text-[--color-text-primary]">{bucket.winRate.toFixed(0)}%</span>
                <span className="text-[9px] text-[--color-text-muted]">({bucket.count})</span>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
