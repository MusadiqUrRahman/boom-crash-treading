'use client';

import { useEffect, useState } from 'react';
import { getWsClient } from '@/lib/ws-client';
import { formatCurrency, formatPercentValue, formatDateTime } from '@/lib/format';
import type { BacktestResult, WsMessage } from '@/types';

export default function BacktestPage() {
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const client = getWsClient();
    client.send('getBacktestResults');

    const unsub = client.subscribe((msg: WsMessage) => {
      if (msg.type === 'response') {
        const resp = msg.data as { data?: BacktestResult };
        if (resp?.data) {
          setResult(resp.data);
          setLoading(false);
        }
      }
    });

    return unsub;
  }, []);

  if (loading) {
    return (
      <div className="bg-[--color-bg-elevated] border border-[--color-border] rounded-lg p-6 animate-pulse space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-12 bg-[--color-bg-hover] rounded" />
        ))}
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex items-center justify-center h-64 text-xs text-[--color-text-muted]">
        No backtest data available.
      </div>
    );
  }

  const s = result.summary;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Trades', value: s.totalTrades },
          { label: 'Win Rate', value: formatPercentValue(s.winRate), positive: s.winRate >= 0.5 },
          { label: 'Net Profit', value: formatCurrency(s.netProfit, 2), positive: s.netProfit >= 0 },
          { label: 'Profit Factor', value: s.profitFactor.toFixed(2) },
          { label: 'Sharpe Ratio', value: s.sharpeRatio.toFixed(2) },
          { label: 'Max Drawdown', value: formatCurrency(s.maxDrawdown, 2), negative: true },
          { label: 'Avg Win', value: formatCurrency(s.avgWin, 4) },
          { label: 'Avg Loss', value: formatCurrency(s.avgLoss, 4), negative: true },
        ].map((card) => (
          <div key={card.label} className="bg-[--color-bg-elevated] border border-[--color-border] rounded-lg p-3">
            <div className="text-[10px] text-[--color-text-muted] uppercase tracking-wider">{card.label}</div>
            <div className={`font-mono text-lg font-bold mt-1 ${
              card.positive ? 'text-green-500' : card.negative ? 'text-red-500' : 'text-[--color-text-primary]'
            }`}>
              {card.value}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-[--color-bg-elevated] border border-[--color-border] rounded-lg p-3">
        <div className="text-[11px] font-medium text-[--color-text-secondary] uppercase tracking-wider mb-2">Config Used</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          {Object.entries(result.config).slice(0, 12).map(([key, val]) => (
            <div key={key} className="flex justify-between">
              <span className="text-[--color-text-muted]">{key}</span>
              <span className="font-mono">{String(val)}</span>
            </div>
          ))}
        </div>
      </div>

      {result.trades && result.trades.length > 0 && (
        <div className="bg-[--color-bg-elevated] border border-[--color-border] rounded-lg overflow-hidden">
          <div className="text-[11px] font-medium text-[--color-text-secondary] uppercase tracking-wider p-3 pb-0">Trades</div>
          <table className="w-full text-xs mt-2">
            <thead>
              <tr className="bg-[--color-bg-hover] text-[--color-text-muted] border-b border-[--color-border]">
                <th className="text-left py-2 px-3 font-medium">ID</th>
                <th className="text-left py-2 px-3 font-medium">Dir</th>
                <th className="text-right py-2 px-3 font-medium">Entry</th>
                <th className="text-right py-2 px-3 font-medium">Exit</th>
                <th className="text-right py-2 px-3 font-medium">Score</th>
                <th className="text-right py-2 px-3 font-medium">PnL</th>
                <th className="text-right py-2 px-3 font-medium">Cum PnL</th>
                <th className="text-center py-2 px-3 font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {result.trades.slice(0, 50).map((t) => (
                <tr key={t.tradeId} className="border-b border-[--color-border]/50 hover:bg-[--color-bg-hover]">
                  <td className="py-1.5 px-3 font-mono text-[--color-text-muted]">{t.tradeId}</td>
                  <td className={`py-1.5 px-3 font-mono font-bold ${t.direction === 'CALL' ? 'text-green-500' : 'text-red-500'}`}>{t.direction}</td>
                  <td className="py-1.5 px-3 font-mono text-right">{t.entryPrice.toFixed(2)}</td>
                  <td className="py-1.5 px-3 font-mono text-right">{t.exitPrice.toFixed(2)}</td>
                  <td className="py-1.5 px-3 font-mono text-right text-[--color-text-muted]">{t.score}</td>
                  <td className={`py-1.5 px-3 font-mono text-right font-bold ${t.win ? 'text-green-500' : 'text-red-500'}`}>
                    {t.pnl >= 0 ? '+' : ''}{t.pnl.toFixed(4)}
                  </td>
                  <td className="py-1.5 px-3 font-mono text-right text-[--color-text-muted]">{t.cumulativePnl.toFixed(2)}</td>
                  <td className="py-1.5 px-3 text-center">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${t.win ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                      {t.win ? 'WIN' : 'LOSS'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
