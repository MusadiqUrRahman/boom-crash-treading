'use client';

import { useEffect, useState } from 'react';
import { useBotStore } from '@/stores/bot-store';
import { getWsClient } from '@/lib/ws-client';
import type { BotConfig, WsMessage } from '@/types';

function ConfigSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[--color-bg-elevated] border border-[--color-border] rounded-lg p-4">
      <div className="text-[11px] font-medium text-[--color-text-secondary] uppercase tracking-wider mb-3">{title}</div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 text-xs">
        {children}
      </div>
    </div>
  );
}

function ConfigRow({ label, value, bestValue }: { label: string; value: string | number; bestValue?: string | number }) {
  const isDifferent = bestValue !== undefined && String(value) !== String(bestValue);
  return (
    <div className="flex justify-between items-center py-0.5">
      <span className="text-[--color-text-muted]">{label}</span>
      <span className={`font-mono ${isDifferent ? 'text-amber-400' : 'text-[--color-text-primary]'}`}>
        {value}
        {isDifferent && bestValue !== undefined && (
          <span className="text-[--color-text-muted] ml-1">(best: {bestValue})</span>
        )}
      </span>
    </div>
  );
}

export default function SettingsPage() {
  const storeConfig = useBotStore((s) => s.config);
  const [config, setConfig] = useState<BotConfig | null>(storeConfig);
  const [bestParams, setBestParams] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(!storeConfig);

  useEffect(() => {
    const client = getWsClient();
    client.send('getConfig');
    client.send('getBestParams');

    const unsub = client.subscribe((msg: WsMessage) => {
      if (msg.type === 'config') {
        setConfig(msg.data as BotConfig);
        setLoading(false);
      } else if (msg.type === 'response') {
        const resp = msg.data as { data?: unknown };
        if (resp?.data) {
          const d = resp.data as Record<string, unknown>;
          if (d.config) setBestParams(d.config as Record<string, unknown>);
          else setBestParams(d as unknown as Record<string, unknown>);
        }
      }
    });

    return unsub;
  }, []);

  if (loading || !config) {
    return (
      <div className="bg-[--color-bg-elevated] border border-[--color-border] rounded-lg p-6 animate-pulse space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-16 bg-[--color-bg-hover] rounded" />
        ))}
      </div>
    );
  }

  const best = bestParams as Record<string, unknown> | null;

  const isMultiplier = config.contractType === 'MULTDOWN';

  return (
    <div className="space-y-3">
      <ConfigSection title="Trading">
        <ConfigRow label="Symbol" value={config.symbol} />
        <ConfigRow label="Direction" value={config.direction} />
        <ConfigRow label="Contract Type" value={config.contractType || 'CALL/PUT'} />
        <ConfigRow label="Mode" value={config.dryRun ? 'DRY-RUN' : 'LIVE'} />
        <ConfigRow label="Stake" value={`$${config.stake.toFixed(2)}`} bestValue={best?.stake ? `$${Number(best.stake).toFixed(2)}` : undefined} />
        {isMultiplier ? (
          <>
            <ConfigRow label="Multiplier" value={config.multiplier ?? '---'} bestValue={best?.multiplier as number} />
            <ConfigRow label="Stop Loss" value={`$${(config.stopLoss ?? 0).toFixed(2)}`} bestValue={best?.stopLoss ? `$${Number(best.stopLoss).toFixed(2)}` : undefined} />
            <ConfigRow label="Take Profit" value={`$${(config.takeProfit ?? 0).toFixed(2)}`} bestValue={best?.takeProfit ? `$${Number(best.takeProfit).toFixed(2)}` : undefined} />
            <ConfigRow label="Max ML Duration" value={`${config.maxMlDurationTicks ?? 10} ticks`} bestValue={best?.maxMlDurationTicks ? `${best.maxMlDurationTicks} ticks` : undefined} />
          </>
        ) : (
          <>
            <ConfigRow label="Duration" value={`${config.durationTicks} ticks`} bestValue={best?.durationTicks ? `${best.durationTicks} ticks` : undefined} />
            <ConfigRow label="Payout Rate" value={`${(config.payoutRate * 100).toFixed(0)}%`} />
          </>
        )}
        <ConfigRow label="Score Threshold" value={config.scoreThreshold} bestValue={best?.scoreThreshold as number} />
        <ConfigRow label="Min Score Spread" value={config.minScoreSpread} bestValue={best?.minScoreSpread as number} />
        <ConfigRow label="Cooldown" value={`${config.cooldownTicks} ticks`} bestValue={best?.cooldownTicks ? `${best.cooldownTicks} ticks` : undefined} />
      </ConfigSection>

      <ConfigSection title="Indicators">
        <ConfigRow label="RSI Period" value={config.rsiPeriod} />
        <ConfigRow label="RSI Oversold" value={config.rsiOversold} bestValue={best?.rsiOversold as number} />
        <ConfigRow label="RSI Overbought" value={config.rsiOverbought} bestValue={best?.rsiOverbought as number} />
        <ConfigRow label="BB Period" value={config.bbPeriod} bestValue={best?.bbPeriod as number} />
        <ConfigRow label="BB StdDev" value={config.bbStdDev} bestValue={best?.bbStdDev as number} />
        <ConfigRow label="EMA Short" value={config.emaShortPeriod} bestValue={best?.emaShortPeriod as number} />
        <ConfigRow label="EMA Long" value={config.emaLongPeriod} bestValue={best?.emaLongPeriod as number} />
        <ConfigRow label="ROC Period" value={config.rocPeriod} bestValue={best?.rocPeriod as number} />
        <ConfigRow label="Spike Threshold" value={config.spikeThreshold} />
      </ConfigSection>

      <ConfigSection title="Risk Limits">
        <ConfigRow label="Max Consecutive Losses" value={config.maxConsecutiveLosses} />
        <ConfigRow label="Max Daily Loss" value={`$${config.maxDailyLoss.toFixed(2)}`} />
        <ConfigRow label="Max Daily Trades" value={config.maxDailyTrades} />
        <ConfigRow label="Starting Balance" value={`$${config.startingBalance.toFixed(2)}`} />
        <ConfigRow label="Max Daily Drawdown" value={`${(config.maxDailyDrawdown * 100).toFixed(0)}%`} />
      </ConfigSection>

      <ConfigSection title="Stake Management">
        <ConfigRow label="Mode" value={config.stakeMode} />
        <ConfigRow label="Base Stake" value={`$${config.baseStake.toFixed(2)}`} />
        <ConfigRow label="Min Stake" value={`$${config.minStake.toFixed(2)}`} />
        <ConfigRow label="Max Stake" value={`$${config.maxStake.toFixed(2)}`} />
        <ConfigRow label="Martingale" value={config.useMartingale ? 'Yes' : 'No'} />
      </ConfigSection>
    </div>
  );
}
