'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useBotStore } from '@/stores/bot-store';
import { getWsClient } from '@/lib/ws-client';
import { formatPnL, formatCurrency, formatDateTime } from '@/lib/format';
import type { Trade, WsMessage, PaginatedTrades } from '@/types';
import { ChevronDown, ChevronUp, Search, ChevronLeft, ChevronRight, Database } from 'lucide-react';

let tradeKeyCounter = 0;
function nextTradeKey() { return `tp-${++tradeKeyCounter}`; }

export default function TradesPage() {
  const storeTrades = useBotStore((s) => s.trades);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterDir, setFilterDir] = useState<string>('ALL');
  const [filterResult, setFilterResult] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalTrades, setTotalTrades] = useState(0);
  const limit = 50;
  const initialLoadRef = useRef(false);

  const fetchPage = useCallback((p: number) => {
    initialLoadRef.current = true;
    const client = getWsClient();
    const params: Record<string, unknown> = { page: p, limit };
    if (filterDir !== 'ALL') params.direction = filterDir;
    if (filterResult !== 'ALL') params.result = filterResult;
    client.send('getAllTrades', params);
    Promise.resolve().then(() => setLoading(true));
  }, [filterDir, filterResult]);

  useEffect(() => {
    fetchPage(page);

    const timeout = setTimeout(() => {
      if (storeTrades.length > 0) {
        const filtered = storeTrades.filter((t) => {
          if (filterDir !== 'ALL' && t.direction !== filterDir) return false;
          if (filterResult !== 'ALL' && ((filterResult === 'WIN') !== t.win)) return false;
          if (searchQuery && !t.localId.toLowerCase().includes(searchQuery.toLowerCase())) return false;
          return true;
        });
        setTrades(filtered);
        setTotalTrades(filtered.length);
        setTotalPages(Math.ceil(filtered.length / limit));
        setLoading(false);
      } else {
        setLoading(false);
      }
    }, 1500);

    const client = getWsClient();
    const unsub = client.subscribe((msg: WsMessage) => {
      if (msg.type === 'response' && msg.data && typeof msg.data === 'object' && !Array.isArray(msg.data)) {
        const resp = msg.data as Record<string, unknown>;
        if (resp.data && typeof resp.data === 'object') {
          const d = resp.data as Record<string, unknown>;
          if ('trades' in d && 'total' in d && 'pages' in d) {
            const p = d as unknown as PaginatedTrades;
            setTrades(p.trades.map(t => ({ ...t, _key: t._key || nextTradeKey() })));
            setTotalTrades(p.total);
            setTotalPages(p.pages);
            setLoading(false);
            clearTimeout(timeout);
          }
        }
      }
    });

    return () => {
      unsub();
      clearTimeout(timeout);
    };
  }, [page, filterDir, filterResult]);

  const filtered = trades.filter((t) => {
    if (searchQuery && !t.localId.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const totalPnL = trades.reduce((s, t) => s + (t.pnl || 0), 0);
  const wins = trades.filter((t) => t.win).length;

  return (
    <div className="space-y-4">
      <div className="bg-[--color-bg-elevated] border border-[--color-border] rounded-xl p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Database size={14} className="text-[--color-accent]" />
            <span className="text-sm font-semibold text-[--color-text-primary]">Trade History</span>
            <span className="text-[10px] text-[--color-text-muted] font-mono">
              {totalTrades.toLocaleString()} total trades
            </span>
          </div>
          <div className="flex-1" />
          <select
            className="bg-[--color-bg] border border-[--color-border] rounded-lg px-2.5 py-1.5 text-xs text-[--color-text-primary] focus:border-[--color-accent] outline-none"
            value={filterDir}
            onChange={(e) => { setFilterDir(e.target.value); setPage(1); }}
          >
            <option value="ALL">All Directions</option>
            <option value="CALL">CALL</option>
            <option value="PUT">PUT</option>
          </select>
          <select
            className="bg-[--color-bg] border border-[--color-border] rounded-lg px-2.5 py-1.5 text-xs text-[--color-text-primary] focus:border-[--color-accent] outline-none"
            value={filterResult}
            onChange={(e) => { setFilterResult(e.target.value); setPage(1); }}
          >
            <option value="ALL">All Results</option>
            <option value="WIN">WIN</option>
            <option value="LOSS">LOSS</option>
          </select>
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[--color-text-muted]" />
            <input
              className="bg-[--color-bg] border border-[--color-border] rounded-lg pl-8 pr-3 py-1.5 text-xs text-[--color-text-primary] w-36 focus:border-[--color-accent] outline-none"
              placeholder="Search ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        {trades.length > 0 && (
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-[--color-border] text-xs">
            <span className="text-[--color-text-muted]">Page Stats:</span>
            <span className="font-mono text-[--color-text-primary]">{trades.length} trades</span>
            <span className="font-mono text-green-400">{wins}W</span>
            <span className="font-mono text-red-400">{trades.length - wins}L</span>
            <span className={`font-mono ${totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              PnL: {formatCurrency(totalPnL, 2)}
            </span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="bg-[--color-bg-elevated] border border-[--color-border] rounded-xl p-6 animate-pulse space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-10 bg-[--color-bg-hover] rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-[--color-bg-elevated] border border-[--color-border] rounded-xl p-10 text-center">
          <Database size={24} className="mx-auto mb-3 text-[--color-text-muted]" />
          <div className="text-xs text-[--color-text-muted]">No trades found matching your filters.</div>
        </div>
      ) : (
        <div className="bg-[--color-bg-elevated] border border-[--color-border] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[--color-bg-hover]/50 text-[--color-text-muted] border-b border-[--color-border]">
                  <th className="text-left py-2.5 px-3 font-medium">ID</th>
                  <th className="text-left py-2.5 px-3 font-medium">Time</th>
                  <th className="text-left py-2.5 px-3 font-medium">Symbol</th>
                  <th className="text-left py-2.5 px-3 font-medium">Type</th>
                  <th className="text-left py-2.5 px-3 font-medium">Dir</th>
                  <th className="text-right py-2.5 px-3 font-medium">Entry</th>
                  <th className="text-right py-2.5 px-3 font-medium">Exit</th>
                  <th className="text-right py-2.5 px-3 font-medium">Duration</th>
                  <th className="text-right py-2.5 px-3 font-medium">Score</th>
                  <th className="text-right py-2.5 px-3 font-medium">Stake</th>
                  <th className="text-right py-2.5 px-3 font-medium">PnL</th>
                  <th className="text-center py-2.5 px-3 font-medium">Result</th>
                  <th className="text-center py-2.5 px-3 font-medium w-8"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => {
                  const entryEpoch = t.entryEpoch || (t.createdAt ? Math.floor(new Date(t.createdAt).getTime() / 1000) : 0);
                  return (
                    <React.Fragment key={t._key}>
                      <tr
                        className="border-b border-[--color-border]/30 hover:bg-[--color-bg-hover]/30 transition-colors cursor-pointer"
                        onClick={() => setSelectedId(selectedId === t.localId ? null : t.localId)}
                      >
                        <td className="py-2.5 px-3 font-mono text-[--color-text-muted] text-[10px]">{t.localId.slice(0, 8)}</td>
                        <td className="py-2.5 px-3 font-mono text-[--color-text-muted] text-[10px]">{formatDateTime(entryEpoch)}</td>
                        <td className="py-2.5 px-3 font-mono text-[--color-text-muted] text-[10px]">{t.symbol}</td>
                        <td className="py-2.5 px-3 font-mono text-[10px]">
                          {t.contractType && t.contractType !== 'CALL' && t.contractType !== 'PUT' ? (
                            <span className="text-purple-400">{t.contractType}</span>
                          ) : (
                            <span className="text-[--color-text-muted]">---</span>
                          )}
                        </td>
                        <td className={`py-2.5 px-3 font-mono font-bold ${t.direction === 'CALL' ? 'text-green-400' : 'text-red-400'}`}>
                          {t.direction}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-right">{t.entryPrice?.toFixed(2) ?? '---'}</td>
                        <td className="py-2.5 px-3 font-mono text-right">{t.exitPrice?.toFixed(2) ?? '---'}</td>
                        <td className="py-2.5 px-3 font-mono text-right text-[--color-text-muted]">
                          {t.durationTicks != null ? `${t.durationTicks}t` : '---'}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-right text-[--color-text-muted]">{t.score ?? '---'}</td>
                        <td className="py-2.5 px-3 font-mono text-right text-[--color-text-muted]">{formatCurrency(t.stake, 2)}</td>
                        <td className={`py-2.5 px-3 font-mono text-right font-bold ${t.win ? 'text-green-400' : 'text-red-400'}`}>
                          {formatPnL(t.pnl)}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${t.win ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
                            {t.win ? 'WIN' : 'LOSS'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {selectedId === t.localId ? <ChevronUp size={12} className="text-[--color-text-muted]" /> : <ChevronDown size={12} className="text-[--color-text-muted]" />}
                        </td>
                      </tr>
                      {selectedId === t.localId && (
                        <tr key={`${t._key}-detail`}>
                          <td colSpan={12} className="bg-[--color-bg-active]/20 px-6 py-4">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                              <div>
                                <span className="text-[--color-text-muted] block text-[10px] uppercase tracking-wider mb-1">Contract ID</span>
                                <span className="font-mono text-[--color-text-primary]">{t.contractId || 'N/A'}</span>
                              </div>
                              <div>
                                <span className="text-[--color-text-muted] block text-[10px] uppercase tracking-wider mb-1">Payout Rate</span>
                                <span className="font-mono text-[--color-text-primary]">{t.payoutRate ? `${(t.payoutRate * 100).toFixed(0)}%` : 'N/A'}</span>
                              </div>
                              <div>
                                <span className="text-[--color-text-muted] block text-[10px] uppercase tracking-wider mb-1">Balance After</span>
                                <span className="font-mono text-[--color-text-primary]">{t.balanceAfter != null ? formatCurrency(t.balanceAfter, 2) : 'N/A'}</span>
                              </div>
                              <div>
                                <span className="text-[--color-text-muted] block text-[10px] uppercase tracking-wider mb-1">Mode</span>
                                <span className={`font-mono ${t.dryRun ? 'text-amber-400' : 'text-green-400'}`}>{t.dryRun ? 'Dry Run' : 'Live'}</span>
                              </div>
                              {t.contractType && t.contractType !== 'CALL' && t.contractType !== 'PUT' && (
                                <div>
                                  <span className="text-[--color-text-muted] block text-[10px] uppercase tracking-wider mb-1">Contract Type</span>
                                  <span className="font-mono text-purple-400">{t.contractType}</span>
                                </div>
                              )}
                              {t.exitReason && (
                                <div>
                                  <span className="text-[--color-text-muted] block text-[10px] uppercase tracking-wider mb-1">Exit Reason</span>
                                  <span className="font-mono text-[--color-text-primary]">{t.exitReason}</span>
                                </div>
                              )}
                              {t.scoreComponents && (
                                <div className="col-span-2 md:col-span-4">
                                  <span className="text-[--color-text-muted] block text-[10px] uppercase tracking-wider mb-2">Score Components</span>
                                  <div className="flex gap-4 font-mono text-[--color-text-primary] flex-wrap">
                                    <span className="bg-[--color-bg] px-2 py-1 rounded">RSI: {t.scoreComponents.rsi}</span>
                                    <span className="bg-[--color-bg] px-2 py-1 rounded">BB: {t.scoreComponents.bb}</span>
                                    <span className="bg-[--color-bg] px-2 py-1 rounded">EMA: {t.scoreComponents.ema}</span>
                                    <span className="bg-[--color-bg] px-2 py-1 rounded">ROC: {t.scoreComponents.roc}</span>
                                    <span className="bg-[--color-bg] px-2 py-1 rounded">MMT: {t.scoreComponents.momentum}</span>
                                    {t.scoreComponents.postSpike !== 0 && <span className="bg-[--color-bg] px-2 py-1 rounded">SPK: {t.scoreComponents.postSpike}</span>}
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 bg-[--color-bg-elevated] border border-[--color-border] rounded-xl px-4 py-3">
          <button
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-[--color-text-secondary] hover:text-[--color-text-primary] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft size={14} /> Prev
          </button>
          <span className="text-xs text-[--color-text-muted] font-mono">
            Page <span className="text-[--color-text-primary] font-bold">{page}</span> of {totalPages}
          </span>
          <button
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-[--color-text-secondary] hover:text-[--color-text-primary] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
