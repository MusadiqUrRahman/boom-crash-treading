'use client';

import { useMemo } from 'react';
import { useBotStore } from '@/stores/bot-store';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { motion } from 'framer-motion';

const REASON_COLORS: Record<string, string> = {
  TP: '#34d399',
  SL: '#f87171',
  TO: '#fbbf24',
  DRAW: '#a78bfa',
  UNKNOWN: '#6b7280',
};

const REASON_LABELS: Record<string, string> = {
  TP: 'Take Profit',
  SL: 'Stop Loss',
  TO: 'Timeout',
  DRAW: 'Draw',
  UNKNOWN: 'Unknown',
};

export function ExitReasons() {
  const trades = useBotStore(s => s.trades);

  const chartData = useMemo(() => {
    const counts: Record<string, { count: number; wins: number }> = {};
    for (const t of trades) {
      const reason = t.exitReason || 'UNKNOWN';
      if (!counts[reason]) counts[reason] = { count: 0, wins: 0 };
      counts[reason].count++;
      if (t.win) counts[reason].wins++;
    }
    return Object.entries(counts)
      .map(([reason, data]) => ({
        name: REASON_LABELS[reason] || reason,
        value: data.count,
        wins: data.wins,
        losses: data.count - data.wins,
        color: REASON_COLORS[reason] || '#6b7280',
      }))
      .sort((a, b) => b.value - a.value);
  }, [trades]);

  if (chartData.length === 0) {
    return (
      <div className="bg-[--color-bg-elevated] border border-[--color-border] rounded-xl p-6">
        <p className="text-[11px] text-[--color-text-muted]">No trade data yet</p>
      </div>
    );
  }

  const total = chartData.reduce((s, d) => s + d.value, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-[--color-bg-elevated] border border-[--color-border] rounded-xl p-4"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-semibold text-[--color-text-muted] uppercase tracking-wider">Exit Reasons</span>
      </div>

      <div className="flex items-center gap-4">
        <div className="h-[120px] w-[120px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={chartData} cx="50%" cy="50%" innerRadius={28} outerRadius={50} dataKey="value" paddingAngle={2}>
                {chartData.map((entry, idx) => (
                  <Cell key={idx} fill={entry.color} opacity={0.8} stroke={entry.color} strokeWidth={1} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 11 }}
                formatter={(value, name) => [`${Number(value)} (${(Number(value) / total * 100).toFixed(0)}%)`, String(name)] as [string, string]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="flex-1 space-y-1.5">
          {chartData.map((d) => (
            <div key={d.name} className="flex items-center justify-between text-[10px]">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ background: d.color }} />
                <span className="text-[--color-text-muted]">{d.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[--color-text-primary] font-mono">{d.value}</span>
                <span className="text-[9px] text-emerald-400">{d.wins}W</span>
                <span className="text-[9px] text-red-400">{d.losses}L</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
