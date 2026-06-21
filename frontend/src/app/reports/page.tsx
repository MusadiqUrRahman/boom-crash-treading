'use client';

import { useEffect, useState } from 'react';
import { getWsClient } from '@/lib/ws-client';
import { formatCurrency, formatDate } from '@/lib/format';
import type { DailyReport, WsMessage } from '@/types';
import { BarChart3, TrendingUp, TrendingDown, Activity, Calendar } from 'lucide-react';

export default function ReportsPage() {
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<DailyReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const client = getWsClient();
    client.send('getDailyReports');

    const unsub = client.subscribe((msg: WsMessage) => {
      if (msg.type === 'response') {
        const resp = msg.data as { data?: DailyReport[] };
        if (resp?.data && Array.isArray(resp.data)) {
          const sorted = resp.data.filter(r => r.date).sort((a, b) => b.date.localeCompare(a.date));
          setReports(sorted);
          if (sorted.length > 0) setSelectedReport(sorted[0]);
          setLoading(false);
        }
      }
    });

    return unsub;
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-[--color-bg-elevated] border border-[--color-border] rounded-xl p-4 animate-pulse">
              <div className="h-4 w-24 bg-[--color-bg-hover] rounded mb-3" />
              <div className="h-8 w-16 bg-[--color-bg-hover] rounded" />
            </div>
          ))}
        </div>
        <div className="bg-[--color-bg-elevated] border border-[--color-border] rounded-xl p-6 animate-pulse">
          <div className="space-y-3">
            {Array.from({length: 8}).map((_, i) => (
              <div key={i} className="h-6 bg-[--color-bg-hover] rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <BarChart3 size={32} className="text-[--color-text-muted]" />
        <div className="text-xs text-[--color-text-muted]">No daily reports generated yet.</div>
        <div className="text-[10px] text-[--color-text-muted]">Reports appear when trades exist in the database.</div>
      </div>
    );
  }

  const totalTrades = reports.reduce((s, r) => s + r.trades.total, 0);
  const totalWins = reports.reduce((s, r) => s + r.trades.wins, 0);
  const totalPnL = reports.reduce((s, r) => s + r.account.totalPnL, 0);
  const totalLosses = totalTrades - totalWins;
  const overallWR = totalTrades > 0 ? (totalWins / totalTrades) * 100 : 0;

  const bestDay = reports.reduce((best, r) =>
    r.trades.winRate > (best?.trades.winRate || 0) ? r : best, reports[0]);
  const worstDay = reports.reduce((worst, r) =>
    r.trades.winRate < (worst?.trades.winRate || 1) ? r : worst, reports[0]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-[--color-bg-elevated] border border-[--color-border] rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Activity size={14} className="text-[--color-accent]" />
            <span className="text-[10px] font-medium text-[--color-text-secondary] uppercase tracking-wider">Total Trades</span>
          </div>
          <div className="font-mono text-2xl font-bold text-[--color-text-primary]">{totalTrades}</div>
          <div className="text-[10px] text-[--color-text-muted] mt-1">{reports.length} trading days</div>
        </div>
        <div className="bg-[--color-bg-elevated] border border-[--color-border] rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={14} className="text-green-400" />
            <span className="text-[10px] font-medium text-[--color-text-secondary] uppercase tracking-wider">Win Rate</span>
          </div>
          <div className={`font-mono text-2xl font-bold ${overallWR >= 50 ? 'text-green-400' : 'text-red-400'}`}>
            {overallWR.toFixed(1)}%
          </div>
          <div className="text-[10px] text-[--color-text-muted] mt-1">{totalWins}W / {totalLosses}L</div>
        </div>
        <div className="bg-[--color-bg-elevated] border border-[--color-border] rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={14} className={totalPnL >= 0 ? 'text-green-400' : 'text-red-400'} />
            <span className="text-[10px] font-medium text-[--color-text-secondary] uppercase tracking-wider">Total PnL</span>
          </div>
          <div className={`font-mono text-2xl font-bold ${totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {formatCurrency(totalPnL, 2)}
          </div>
          <div className="text-[10px] text-[--color-text-muted] mt-1">All time</div>
        </div>
        <div className="bg-[--color-bg-elevated] border border-[--color-border] rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Calendar size={14} className="text-[--color-text-muted]" />
            <span className="text-[10px] font-medium text-[--color-text-secondary] uppercase tracking-wider">Best Day</span>
          </div>
          <div className="font-mono text-lg font-bold text-green-400">
            {bestDay ? `${(bestDay.trades.winRate * 100).toFixed(0)}%` : '---'}
          </div>
          <div className="text-[10px] text-[--color-text-muted] mt-1">{bestDay ? formatDate(bestDay.date) : '---'}</div>
        </div>
      </div>

      <div className="flex gap-3">
        <div className="w-36 shrink-0 space-y-0.5">
          <div className="text-[10px] font-medium text-[--color-text-secondary] uppercase tracking-wider mb-2 px-2">
            <Calendar size={12} className="inline mr-1" />Dates
          </div>
          {reports.map((r, i) => (
            <button
              key={r.date + r.symbol + r.direction + i}
              onClick={() => setSelectedReport(r)}
              className={`w-full text-left px-3 py-1.5 text-xs rounded-lg transition-all ${
                selectedReport?.date === r.date && selectedReport?.symbol === r.symbol && selectedReport?.direction === r.direction
                  ? 'bg-[--color-accent]/15 text-[--color-accent] font-medium border border-[--color-accent]/30'
                  : 'text-[--color-text-secondary] hover:text-[--color-text-primary] hover:bg-[--color-bg-hover] border border-transparent'
              }`}
            >
              <div className="font-medium">{formatDate(r.date)}</div>
              <div className="text-[10px] opacity-60">{r.symbol} {r.direction}</div>
            </button>
          ))}
        </div>

        {selectedReport && (
          <div className="flex-1 space-y-4">
            <div className="bg-[--color-bg-elevated] border border-[--color-border] rounded-xl p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className={`p-2 rounded-lg ${selectedReport.account.totalPnL >= 0 ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                  {selectedReport.account.totalPnL >= 0
                    ? <TrendingUp size={16} className="text-green-400" />
                    : <TrendingDown size={16} className="text-red-400" />
                  }
                </div>
                <div>
                  <span className="text-sm font-semibold">{formatDate(selectedReport.date)}</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-[--color-text-muted]">{selectedReport.symbol}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                      selectedReport.direction === 'CALL' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
                    }`}>{selectedReport.direction}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                <div className="bg-[--color-bg] rounded-lg p-3">
                  <div className="text-[10px] text-[--color-text-muted] uppercase tracking-wider mb-1">Trades</div>
                  <div className="font-mono text-lg font-bold">{selectedReport.trades.total}</div>
                  <div className="text-[10px] text-[--color-text-muted]">{selectedReport.trades.wins}W / {selectedReport.trades.losses}L</div>
                </div>
                <div className="bg-[--color-bg] rounded-lg p-3">
                  <div className="text-[10px] text-[--color-text-muted] uppercase tracking-wider mb-1">Win Rate</div>
                  <div className={`font-mono text-lg font-bold ${selectedReport.trades.winRate >= 0.5 ? 'text-green-400' : 'text-red-400'}`}>
                    {(selectedReport.trades.winRate * 100).toFixed(1)}%
                  </div>
                  <div className="text-[10px] text-[--color-text-muted]">Max streak: {selectedReport.trades.maxConsecutiveWins}W / {selectedReport.trades.maxConsecutiveLosses}L</div>
                </div>
                <div className="bg-[--color-bg] rounded-lg p-3">
                  <div className="text-[10px] text-[--color-text-muted] uppercase tracking-wider mb-1">PnL</div>
                  <div className={`font-mono text-lg font-bold ${selectedReport.account.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {formatCurrency(selectedReport.account.totalPnL, 2)}
                  </div>
                  <div className="text-[10px] text-[--color-text-muted]">Max DD: {formatCurrency(selectedReport.account.maxDrawdown, 2)}</div>
                </div>
                <div className="bg-[--color-bg] rounded-lg p-3">
                  <div className="text-[10px] text-[--color-text-muted] uppercase tracking-wider mb-1">Profit Factor</div>
                  <div className="font-mono text-lg font-bold">
                    {selectedReport.trades.profitFactor === Infinity ? '∞' : selectedReport.trades.profitFactor.toFixed(2)}
                  </div>
                  <div className="text-[10px] text-[--color-text-muted]">
                    Avg W: {formatCurrency(selectedReport.trades.avgWin, 4)} / Avg L: {formatCurrency(selectedReport.trades.avgLoss, 4)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-5 text-xs">
                <div>
                  <h4 className="text-[--color-text-muted] uppercase text-[10px] mb-2 font-medium tracking-wider">Account</h4>
                  <div className="space-y-1.5 bg-[--color-bg] rounded-lg p-3">
                    <div className="flex justify-between"><span className="text-[--color-text-muted]">Start PnL</span><span className="font-mono">{formatCurrency(selectedReport.account.startBalance, 2)}</span></div>
                    <div className="flex justify-between"><span className="text-[--color-text-muted]">End PnL</span><span className="font-mono">{formatCurrency(selectedReport.account.endBalance, 2)}</span></div>
                    <div className="flex justify-between"><span className="text-[--color-text-muted]">Daily Return</span><span className={`font-mono ${selectedReport.account.dailyReturn >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {(selectedReport.account.dailyReturn * 100).toFixed(2)}%
                    </span></div>
                    <div className="flex justify-between"><span className="text-[--color-text-muted]">Max Drawdown</span><span className="font-mono text-red-400">{formatCurrency(selectedReport.account.maxDrawdown, 2)}</span></div>
                  </div>
                </div>
                <div>
                  <h4 className="text-[--color-text-muted] uppercase text-[10px] mb-2 font-medium tracking-wider">Performance</h4>
                  <div className="space-y-1.5 bg-[--color-bg] rounded-lg p-3">
                    <div className="flex justify-between"><span className="text-[--color-text-muted]">Avg Win</span><span className="font-mono text-green-400">{formatCurrency(selectedReport.trades.avgWin, 4)}</span></div>
                    <div className="flex justify-between"><span className="text-[--color-text-muted]">Avg Loss</span><span className="font-mono text-red-400">{formatCurrency(selectedReport.trades.avgLoss, 4)}</span></div>
                    <div className="flex justify-between"><span className="text-[--color-text-muted]">Avg Stake</span><span className="font-mono">{formatCurrency(selectedReport.trades.averageStake, 2)}</span></div>
                    <div className="flex justify-between"><span className="text-[--color-text-muted]">Total Stake</span><span className="font-mono">{formatCurrency(selectedReport.trades.totalStake, 2)}</span></div>
                  </div>
                </div>
              </div>

              {selectedReport.timeAnalysis && (
                <div className="mt-4">
                  <h4 className="text-[--color-text-muted] uppercase text-[10px] mb-2 font-medium tracking-wider">Time Analysis</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-[--color-bg] rounded-lg p-3">
                      <div className="text-[10px] text-[--color-text-muted]">Best Hour</div>
                      <div className="font-mono font-bold text-green-400">
                        {selectedReport.timeAnalysis.bestHour}:00 UTC
                      </div>
                      <div className="text-[10px] text-[--color-text-muted]">
                        WR {(selectedReport.timeAnalysis.bestHourWR * 100).toFixed(0)}%
                      </div>
                    </div>
                    <div className="bg-[--color-bg] rounded-lg p-3">
                      <div className="text-[10px] text-[--color-text-muted]">Worst Hour</div>
                      <div className="font-mono font-bold text-red-400">
                        {selectedReport.timeAnalysis.worstHour}:00 UTC
                      </div>
                      <div className="text-[10px] text-[--color-text-muted]">
                        WR {(selectedReport.timeAnalysis.worstHourWR * 100).toFixed(0)}%
                      </div>
                    </div>
                    <div className="bg-[--color-bg] rounded-lg p-3">
                      <div className="text-[10px] text-[--color-text-muted]">Total Stake</div>
                      <div className="font-mono font-bold">{formatCurrency(selectedReport.trades.totalStake, 2)}</div>
                    </div>
                    <div className="bg-[--color-bg] rounded-lg p-3">
                      <div className="text-[10px] text-[--color-text-muted]">Profit Factor</div>
                      <div className="font-mono font-bold">
                        {selectedReport.trades.profitFactor === Infinity ? '∞' : selectedReport.trades.profitFactor.toFixed(2)}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
