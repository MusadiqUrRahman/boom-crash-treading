'use client';

import { useState, useMemo } from 'react';
import { useBotStore } from '@/stores/bot-store';
import { motion } from 'framer-motion';
import { Sliders, Play } from 'lucide-react';

interface SimParams {
  scoreThreshold: number;
  durationTicks: number;
  cooldownTicks: number;
}

export function ParamSimulator() {
  const signals = useBotStore(s => s.signals);
  const config = useBotStore(s => s.config);

  const [params, setParams] = useState<SimParams>({
    scoreThreshold: config?.scoreThreshold ?? 3,
    durationTicks: config?.durationTicks ?? 10,
    cooldownTicks: config?.cooldownTicks ?? 5,
  });

  const current = useMemo(() => config ? {
    scoreThreshold: config.scoreThreshold,
    durationTicks: config.durationTicks,
    cooldownTicks: config.cooldownTicks,
  } : null, [config]);

  const result = useMemo(() => {
    if (signals.length === 0) return null;
    const resolved = signals.filter(s => s.resolved && s.outcome != null);
    if (resolved.length === 0) return null;

    let simWins = 0, simLosses = 0, simPnL = 0;
    let lastTradeIdx = -params.cooldownTicks;

    for (let i = 0; i < resolved.length; i++) {
      const s = resolved[i];
      if (s.score < params.scoreThreshold) continue;
      if (i - lastTradeIdx < params.cooldownTicks) continue;
      lastTradeIdx = i;
      if (s.outcome === 'WIN') { simWins++; simPnL += s.pnl || 1; }
      else { simLosses++; simPnL -= Math.abs(s.pnl || 1); }
    }

    const total = simWins + simLosses;
    const winRate = total > 0 ? (simWins / total) * 100 : 0;
    const grossProfit = resolved.filter(s => s.outcome === 'WIN').reduce((a, s) => a + Math.abs(s.pnl || 1), 0);
    const grossLoss = resolved.filter(s => s.outcome === 'LOSS').reduce((a, s) => a + Math.abs(s.pnl || 1), 0);
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

    return { totalTrades: total, wins: simWins, losses: simLosses, winRate, totalPnL: simPnL, profitFactor };
  }, [params, signals]);

  const currentResult = useMemo(() => {
    if (!current || signals.length === 0) return null;
    const resolved = signals.filter(s => s.resolved && s.outcome != null);
    if (resolved.length === 0) return null;

    let simWins = 0, simLosses = 0, simPnL = 0;
    let lastTradeIdx = -current.cooldownTicks;

    for (let i = 0; i < resolved.length; i++) {
      const s = resolved[i];
      if (s.score < current.scoreThreshold) continue;
      if (i - lastTradeIdx < current.cooldownTicks) continue;
      lastTradeIdx = i;
      if (s.outcome === 'WIN') { simWins++; simPnL += s.pnl || 1; }
      else { simLosses++; simPnL -= Math.abs(s.pnl || 1); }
    }

    const total = simWins + simLosses;
    return {
      totalTrades: total,
      wins: simWins,
      losses: simLosses,
      winRate: total > 0 ? (simWins / total) * 100 : 0,
      totalPnL: simPnL,
    };
  }, [signals, current]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-[--color-bg-elevated] border border-[--color-border] rounded-xl p-4"
    >
      <div className="flex items-center gap-2 mb-3">
        <Sliders size={12} className="text-[--color-text-muted]" />
        <span className="text-[11px] font-semibold text-[--color-text-muted] uppercase tracking-wider">Parameter Simulator</span>
      </div>

      <p className="text-[9px] text-[--color-text-muted] mb-3">
        Adjust parameters to see how they would affect performance on historical signals
      </p>

      <div className="grid grid-cols-3 gap-3 mb-4">
        {(['scoreThreshold', 'durationTicks', 'cooldownTicks'] as (keyof SimParams)[]).map((key) => (
          <div key={key}>
            <label className="text-[9px] text-[--color-text-muted] block mb-1">
              {key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}
              {current && (
                <span className="text-[8px] ml-1 text-[--color-text-muted]">(current: {String(current[key])})</span>
              )}
            </label>
            <input
              type="range"
              min={key === 'scoreThreshold' ? 1 : key === 'durationTicks' ? 3 : 1}
              max={key === 'scoreThreshold' ? 15 : key === 'durationTicks' ? 30 : 20}
              step={1}
              value={params[key]}
              onChange={(e) => setParams(p => ({ ...p, [key]: parseInt(e.target.value) }))}
              className="w-full h-1 appearance-none bg-[--color-bg-hover] rounded-full cursor-pointer accent-blue-500"
            />
            <span className="font-mono text-[10px] text-[--color-text-primary]">{params[key]}</span>
          </div>
        ))}
      </div>

      {result && (
        <div className="border border-[--color-border] rounded-lg p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Play size={10} className="text-emerald-400" />
            <span className="text-[10px] font-medium text-[--color-text-muted]">Simulated Result</span>
          </div>
          <div className="grid grid-cols-5 gap-2 text-[10px]">
            <div>
              <span className="text-[--color-text-muted] block">Trades</span>
              <span className="font-mono text-[--color-text-primary]">{result.totalTrades}</span>
            </div>
            <div>
              <span className="text-[--color-text-muted] block">Win Rate</span>
              <span className="font-mono" style={{ color: result.winRate >= 50 ? '#34d399' : '#f87171' }}>
                {result.winRate.toFixed(0)}%
              </span>
            </div>
            <div>
              <span className="text-[--color-text-muted] block">PnL</span>
              <span className="font-mono" style={{ color: result.totalPnL >= 0 ? '#34d399' : '#f87171' }}>
                ${result.totalPnL.toFixed(0)}
              </span>
            </div>
            <div>
              <span className="text-[--color-text-muted] block">W/L</span>
              <span className="font-mono text-[--color-text-primary]">{result.wins}/{result.losses}</span>
            </div>
            <div>
              <span className="text-[--color-text-muted] block">Profit Factor</span>
              <span className="font-mono text-[--color-text-primary]">{result.profitFactor === Infinity ? '∞' : result.profitFactor.toFixed(2)}</span>
            </div>
          </div>

          {currentResult && (
            <div className="mt-2 pt-2 border-t border-[--color-border] text-[9px] text-[--color-text-muted]">
              vs current config: {currentResult.totalTrades} trades, {currentResult.winRate.toFixed(0)}% WR, ${currentResult.totalPnL.toFixed(0)} PnL
              <span className="ml-1" style={{
                color: result.totalPnL > currentResult.totalPnL ? '#34d399' : result.totalPnL < currentResult.totalPnL ? '#f87171' : 'inherit',
              }}>
                ({result.totalPnL >= currentResult.totalPnL ? '+' : ''}${(result.totalPnL - currentResult.totalPnL).toFixed(0)})
              </span>
            </div>
          )}
        </div>
      )}

      {!result && (
        <p className="text-[10px] text-[--color-text-muted] py-2">Need resolved signals to simulate</p>
      )}
    </motion.div>
  );
}
