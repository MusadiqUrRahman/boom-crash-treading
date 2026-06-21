'use client';

import { useMemo } from 'react';
import { useBotStore } from '@/stores/bot-store';
import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { motion } from 'framer-motion';

export function TradeDuration() {
  const trades = useBotStore(s => s.trades);

  const chartData = useMemo(() => {
    return trades
      .filter(t => t.durationTicks > 0 && t.pnl != null)
      .map(t => ({
        duration: t.durationTicks,
        pnl: t.pnl || 0,
        fill: t.win ? '#34d399' : '#f87171',
        opacity: 0.6,
      }));
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
        <span className="text-[11px] font-semibold text-[--color-text-muted] uppercase tracking-wider">Duration vs PnL</span>
      </div>

      <div className="h-[180px]">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 4, right: 4, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis
              dataKey="duration"
              tick={{ fontSize: 8, fill: 'rgba(255,255,255,0.3)' }}
              label={{ value: 'Duration (ticks)', position: 'bottom', style: { fontSize: 8, fill: 'rgba(255,255,255,0.3)' } }}
            />
            <YAxis
              dataKey="pnl"
              tick={{ fontSize: 8, fill: 'rgba(255,255,255,0.3)' }}
              tickFormatter={(v: number) => `$${v.toFixed(1)}`}
              label={{ value: 'PnL', angle: -90, position: 'insideLeft', style: { fontSize: 8, fill: 'rgba(255,255,255,0.3)' } }}
            />
            <ZAxis range={[16, 16]} />
            <Tooltip
              contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 11 }}
              formatter={(value, name) => {
                const v = Number(value);
                if (name === 'pnl') return [`$${v.toFixed(2)}`, 'PnL'] as [string, string];
                return [v, 'Duration'] as [number, string];
              }}
            />
            <Scatter data={chartData} fill="#34d399" opacity={0.6} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}
