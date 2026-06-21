'use client';

import { useEffect, useState } from 'react';
import { getWsClient } from '@/lib/ws-client';
import { formatCurrency, formatPercentValue } from '@/lib/format';
import type { WsMessage } from '@/types';

interface Metrics {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  profitFactor: number;
  netProfit: number;
  sharpeRatio: number;
  maxDrawdown: number;
  maxConsecutiveLosses: number;
  avgWin: number;
  avgLoss: number;
}

function MetricsCard({ title, metrics }: { title: string; metrics: Metrics }) {
  return (
    <div className="bg-[--color-bg-elevated] border border-[--color-border] rounded-lg p-3">
      <div className="text-[11px] font-medium text-[--color-text-secondary] uppercase tracking-wider mb-3">{title}</div>
      <div className="space-y-1.5 text-xs">
        <div className="flex justify-between"><span className="text-[--color-text-muted]">Trades</span><span className="font-mono">{metrics.totalTrades}</span></div>
        <div className="flex justify-between"><span className="text-[--color-text-muted]">Wins</span><span className="font-mono text-green-500">{metrics.wins}</span></div>
        <div className="flex justify-between"><span className="text-[--color-text-muted]">Losses</span><span className="font-mono text-red-500">{metrics.losses}</span></div>
        <div className="flex justify-between"><span className="text-[--color-text-muted]">Win Rate</span><span className="font-mono text-green-500">{formatPercentValue(metrics.winRate)}</span></div>
        <div className="flex justify-between"><span className="text-[--color-text-muted]">Net Profit</span><span className="font-mono">{formatCurrency(metrics.netProfit, 2)}</span></div>
        <div className="flex justify-between"><span className="text-[--color-text-muted]">Profit Factor</span><span className="font-mono">{metrics.profitFactor?.toFixed(2) ?? 'N/A'}</span></div>
        <div className="flex justify-between"><span className="text-[--color-text-muted]">Sharpe</span><span className="font-mono">{metrics.sharpeRatio?.toFixed(2) ?? 'N/A'}</span></div>
        <div className="flex justify-between"><span className="text-[--color-text-muted]">Max DD</span><span className="font-mono text-red-500">{formatCurrency(metrics.maxDrawdown, 2)}</span></div>
      </div>
    </div>
  );
}

export default function OptimizationPage() {
  const [bestParams, setBestParams] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const client = getWsClient();
    client.send('getBestParams');

    const unsub = client.subscribe((msg: WsMessage) => {
      if (msg.type === 'response') {
        const resp = msg.data as { data?: Record<string, unknown> };
        if (resp?.data) {
          setBestParams(resp.data as Record<string, unknown>);
          setLoading(false);
        }
      }
    });

    return unsub;
  }, []);

  if (loading) {
    return (
      <div className="bg-[--color-bg-elevated] border border-[--color-border] rounded-lg p-6 animate-pulse space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 bg-[--color-bg-hover] rounded" />
        ))}
      </div>
    );
  }

  if (!bestParams) {
    return (
      <div className="flex items-center justify-center h-64 text-xs text-[--color-text-muted]">
        No optimization data available.
      </div>
    );
  }

  const config = bestParams.config as Record<string, unknown> | undefined;
  const training = bestParams.training as Metrics | undefined;
  const validation = bestParams.validation as Metrics | undefined;
  const test = bestParams.test as Metrics | undefined;

  return (
    <div className="space-y-3">
      {config && (
        <div className="bg-[--color-bg-elevated] border border-[--color-border] rounded-lg p-3">
          <div className="text-[11px] font-medium text-[--color-text-secondary] uppercase tracking-wider mb-2">Best Parameters</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            {Object.entries(config).slice(0, 16).map(([key, val]) => (
              <div key={key} className="flex justify-between">
                <span className="text-[--color-text-muted]">{key}</span>
                <span className="font-mono text-[--color-text-primary]">{String(val)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {training && <MetricsCard title="Training" metrics={training} />}
        {validation && <MetricsCard title="Validation" metrics={validation} />}
        {test && <MetricsCard title="Test" metrics={test} />}
      </div>
    </div>
  );
}
