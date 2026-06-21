'use client';

import { useBotStore } from '@/stores/bot-store';
import { formatPnL } from '@/lib/format';

export function RecentTrades() {
  const trades = useBotStore((s) => s.trades);
  const recent = trades.slice(0, 10);

  if (recent.length === 0) {
    return (
      <div className="bg-[--color-bg-elevated] border border-[--color-border] rounded-lg p-4">
        <div className="text-[11px] font-medium text-[--color-text-secondary] uppercase tracking-wider mb-3">Recent Trades</div>
        <div className="flex flex-col items-center justify-center py-6 text-xs text-[--color-text-muted]">
          <div className="mb-1">No trades yet today</div>
          <div>Trades will appear here when signals are executed</div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[--color-bg-elevated] border border-[--color-border] rounded-lg p-3">
      <div className="text-[11px] font-medium text-[--color-text-secondary] uppercase tracking-wider mb-2">Recent Trades</div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[--color-text-muted] border-b border-[--color-border]">
              <th className="text-left py-1.5 pr-2 font-medium">ID</th>
              <th className="text-left py-1.5 px-2 font-medium">Dir</th>
              <th className="text-right py-1.5 px-2 font-medium">Entry</th>
              <th className="text-right py-1.5 px-2 font-medium">Exit</th>
              <th className="text-right py-1.5 px-2 font-medium">PnL</th>
              <th className="text-center py-1.5 pl-2 font-medium">Result</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((t) => (
              <tr
                key={t._key}
                className="border-b border-[--color-border]/50 hover:bg-[--color-bg-hover] transition-colors"
              >
                <td className="py-1.5 pr-2 font-mono text-[--color-text-muted]">{t.localId}</td>
                <td className={`py-1.5 px-2 font-mono font-bold ${t.direction === 'CALL' ? 'text-green-500' : 'text-red-500'}`}>
                  {t.direction}
                </td>
                <td className="py-1.5 px-2 font-mono text-right">{t.entryPrice != null ? t.entryPrice.toFixed(2) : '---'}</td>
                <td className="py-1.5 px-2 font-mono text-right">{t.exitPrice != null ? t.exitPrice.toFixed(2) : '---'}</td>
                <td className={`py-1.5 px-2 font-mono text-right font-bold ${t.win ? 'text-green-500' : 'text-red-500'}`}>
                  {formatPnL(t.pnl)}
                </td>
                <td className="py-1.5 pl-2 text-center">
                  <span className={`px-1 py-0.5 rounded text-[10px] font-bold ${
                    t.win ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                  }`}>
                    {t.win ? 'WIN' : 'LOSS'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
