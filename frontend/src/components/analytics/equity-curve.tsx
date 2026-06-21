'use client';

import { useMemo } from 'react';
import { useBotStore } from '@/stores/bot-store';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { motion } from 'framer-motion';

export function EquityCurve() {
  const trades = useBotStore(s => s.trades);

  const chartData = useMemo(() => {
    const sorted = [...trades].sort((a, b) => (a.exitEpoch || 0) - (b.exitEpoch || 0));
    let cumPnl = 0;
    let peak = 0;
    const points: { label: string; equity: number; drawdown: number; pnl: number; win: boolean }[] = [];
    for (const t of sorted) {
      cumPnl += (t.pnl || 0);
      if (cumPnl > peak) peak = cumPnl;
      const dd = peak > 0 ? ((peak - cumPnl) / peak) * 100 : 0;
      points.push({
        label: new Date((t.exitEpoch || 0) * 1000).toLocaleTimeString('en-US', { hour12: false }),
        equity: cumPnl,
        drawdown: -dd,
        pnl: t.pnl || 0,
        win: t.win,
      });
    }
    return points;
  }, [trades]);

  if (chartData.length === 0) {
    return (
      <div className="bg-[--color-bg-elevated] border border-[--color-border] rounded-xl p-6">
        <p className="text-[11px] text-[--color-text-muted]">No trade data yet</p>
      </div>
    );
  }

  const equityColor = chartData[chartData.length - 1]?.equity >= 0 ? '#34d399' : '#f87171';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-[--color-bg-elevated] border border-[--color-border] rounded-xl p-4"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-semibold text-[--color-text-muted] uppercase tracking-wider">Equity Curve</span>
        <span className="text-[10px] text-[--color-text-muted]">{chartData.length} trades</span>
      </div>

      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 4, left: 0 }}>
            <defs>
              <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={equityColor} stopOpacity={0.3} />
                <stop offset="100%" stopColor={equityColor} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="label" tick={{ fontSize: 8, fill: 'rgba(255,255,255,0.3)' }} interval="preserveStartEnd" minTickGap={60} />
            <YAxis tick={{ fontSize: 8, fill: 'rgba(255,255,255,0.3)' }} tickFormatter={(v) => `$${v.toFixed(0)}`} width={40} domain={['dataMin - 5', 'dataMax + 5']} />
            <Tooltip
              contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 11, boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}
              labelStyle={{ color: 'rgba(255,255,255,0.5)', fontSize: 9 }}
              formatter={(value, name) => [
                name === 'equity' ? `$${Number(value).toFixed(2)}` : `${Number(value).toFixed(1)}%`,
                name === 'equity' ? 'Equity' : 'Drawdown'
              ] as [string, string]}
            />
            <Area type="monotone" dataKey="equity" stroke={equityColor} strokeWidth={1.5} fill="url(#equityGrad)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="h-[60px] mt-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 0, right: 4, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f87171" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#f87171" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <XAxis dataKey="label" hide />
            <YAxis tick={{ fontSize: 8, fill: 'rgba(255,255,255,0.3)' }} tickFormatter={(v) => `${v.toFixed(0)}%`} width={32} domain={[-100, 0]} reversed />
            <Tooltip
              contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 11 }}
              formatter={(value) => [`${Number(value).toFixed(1)}%`, 'Drawdown'] as [string, string]}
            />
            <Area type="monotone" dataKey="drawdown" stroke="#f87171" strokeWidth={1} fill="url(#ddGrad)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center justify-between mt-2 text-[9px] text-[--color-text-muted]">
        <span className="flex items-center gap-1">
          <span className="w-2 h-0.5 rounded bg-[#34d399]" />
          Equity
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-0.5 rounded bg-[#f87171]" />
          Drawdown
        </span>
      </div>
    </motion.div>
  );
}
