'use client';

import { useMemo } from 'react';
import { useBotStore } from '@/stores/bot-store';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';
import { motion } from 'framer-motion';

export function PnLDistribution() {
  const trades = useBotStore(s => s.trades);

  const chartData = useMemo(() => {
    if (trades.length === 0) return [];
    const pnls = trades.map(t => t.pnl || 0);
    const max = Math.max(...pnls, 0.01);
    const min = Math.min(...pnls, -0.01);
    const range = max - min;
    const numBins = Math.min(20, Math.max(5, Math.floor(Math.sqrt(trades.length))));
    const binWidth = range / numBins;

    const bins: { binStart: number; binEnd: number; count: number; label: string; fill: string }[] = [];
    for (let i = 0; i < numBins; i++) {
      const start = min + i * binWidth;
      const end = start + binWidth;
      bins.push({
        binStart: start,
        binEnd: end,
        count: 0,
        label: `$${start.toFixed(2)}`,
        fill: start >= 0 ? '#34d399' : '#f87171',
      });
    }

    for (const pnl of pnls) {
      const idx = Math.min(numBins - 1, Math.max(0, Math.floor((pnl - min) / binWidth)));
      bins[idx].count++;
    }

    return bins;
  }, [trades]);

  if (chartData.length === 0) {
    return (
      <div className="bg-[--color-bg-elevated] border border-[--color-border] rounded-xl p-6">
        <p className="text-[11px] text-[--color-text-muted]">No trade data yet</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-[--color-bg-elevated] border border-[--color-border] rounded-xl p-4"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-semibold text-[--color-text-muted] uppercase tracking-wider">PnL Distribution</span>
      </div>

      <div className="h-[180px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="label" tick={{ fontSize: 8, fill: 'rgba(255,255,255,0.3)' }} interval={Math.max(1, Math.floor(chartData.length / 8))} />
            <YAxis tick={{ fontSize: 8, fill: 'rgba(255,255,255,0.3)' }} width={24} />
            <Tooltip
              contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 11, boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}
              labelStyle={{ color: 'rgba(255,255,255,0.5)', fontSize: 9 }}
              formatter={(value) => [Number(value), 'Trades'] as [number, string]}
              labelFormatter={(label) => `Range: ${label}`}
            />
            <Bar dataKey="count" radius={[1, 1, 0, 0]}>
              {chartData.map((entry, index) => (
                <Cell key={index} fill={entry.fill} opacity={0.7} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}
