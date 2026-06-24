'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useBotStore } from '@/stores/bot-store';
import { getWsClient } from '@/lib/ws-client';
import { formatPnL } from '@/lib/format';
import type { Signal, WsMessage, SignalStats } from '@/types';
import { Zap, ArrowUpRight, ArrowDownRight, ChevronRight } from 'lucide-react';

// Signals use ISO UTC format "2026-06-21T11:48:59.560Z" - parse with standard Date()
function isToday(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const tradeTime = new Date(dateStr).getTime();
  if (isNaN(tradeTime)) return false;
  const now = new Date();
  return now.getFullYear() === new Date(tradeTime).getFullYear()
    && now.getMonth() === new Date(tradeTime).getMonth()
    && now.getDate() === new Date(tradeTime).getDate();
}

export function SignalHistory() {
  const storeSignals = useBotStore((s) => s.signals);
  const setSignals = useBotStore((s) => s.setSignals);
  const setSignalStats = useBotStore((s) => s.setSignalStats);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [, forceUpdate] = useState(0);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const scheduleReset = () => {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      timerRef.current = setTimeout(() => { forceUpdate(n => n + 1); scheduleReset(); }, midnight.getTime() - now.getTime());
    };
    scheduleReset();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const fetchSignalStats = useCallback(() => {
    const client = getWsClient();
    const unsub = client.subscribe((msg: WsMessage) => {
      if (msg.type === 'response') {
        const resp = msg.data as Record<string, unknown>;
        if (resp?.data && typeof resp.data === 'object') {
          const d = resp.data as Record<string, unknown>;
          if ('total' in d && 'resolved' in d && 'wins' in d) {
            setSignalStats(d as unknown as SignalStats);
          }
          if (Array.isArray(resp.data)) {
            const arr = resp.data as Record<string, unknown>[];
            if (arr.length > 0 && 'score' in arr[0] && 'price' in arr[0]) {
              setSignals(arr as unknown as Signal[]);
              setLoading(false);
            }
          }
        }
      }
    });
    client.send('getSignalStats');
    client.send('getSignals', { limit: 100, offset: 0 });
    return unsub;
  }, [setSignals, setSignalStats]);

  useEffect(() => {
    const unsub = fetchSignalStats();
    return () => { unsub(); };
  }, [fetchSignalStats]);

  const todaySignals = useMemo(() => {
    return storeSignals.filter(s => isToday(s.timestamp ?? null));
  }, [storeSignals]);

  const recent = todaySignals.slice(0, 50);
  const totalScore = todaySignals.reduce((s, sig) => s + sig.score, 0);
  const avgScore = todaySignals.length > 0 ? (totalScore / todaySignals.length).toFixed(1) : '---';
  const todayWins = todaySignals.filter(s => s.resolved && s.outcome === 'WIN').length;
  const todayLosses = todaySignals.filter(s => s.resolved && s.outcome === 'LOSS').length;
  const todayResolved = todayWins + todayLosses;
  const todayHitRate = todayResolved > 0 ? ((todayWins / todayResolved) * 100).toFixed(0) : '---';

  const toggleExpand = useCallback((id: number) => {
    setExpandedId(prev => prev === id ? null : id);
  }, []);

  return (
    <div className="bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-lg">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2">
          <Zap size={11} className="text-purple-400" />
          <span className="text-[10px] font-semibold text-[--color-text-muted] uppercase tracking-wider">Signals</span>
          <span className="text-[9px] text-[--color-text-muted] font-mono">{todaySignals.length}</span>
        </div>
        <div className="flex items-center gap-2.5 text-[9px] font-mono tabular-nums">
          {todaySignals.length > 0 && (
            <>
              <span className="text-emerald-400">{todayWins}W</span>
              <span className="text-red-400">{todayLosses}L</span>
              <span className="text-[--color-text-muted]">{todayHitRate}%</span>
              <span className="text-[--color-text-muted]">avg {avgScore}</span>
            </>
          )}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-6">
          <div className="w-3 h-3 border-2 border-purple-500/30 border-t-purple-400 rounded-full animate-spin" />
        </div>
      ) : recent.length === 0 ? (
        <div className="flex items-center justify-center py-6 text-[10px] text-[--color-text-muted]">
          {todaySignals.length === 0 ? 'No signals today' : 'No data'}
        </div>
      ) : (
        <div className="max-h-[280px] overflow-y-auto scrollbar-thin">
          <table className="w-full text-[10px]">
            <thead>
              <tr className="text-[--color-text-muted] border-b border-[var(--color-border)] sticky top-0 z-10 bg-[var(--color-bg-elevated)]">
                <th className="text-left py-1 px-3 font-medium text-[8px] uppercase tracking-wider w-5"></th>
                <th className="text-left py-1 font-medium text-[8px] uppercase tracking-wider">Time</th>
                <th className="text-center py-1 font-medium text-[8px] uppercase tracking-wider">Score</th>
                <th className="text-center py-1 font-medium text-[8px] uppercase tracking-wider">Dir</th>
                <th className="text-right py-1 font-medium text-[8px] uppercase tracking-wider">Price</th>
                <th className="text-center py-1 font-medium text-[8px] uppercase tracking-wider">Action</th>
                <th className="text-center py-1 px-3 font-medium text-[8px] uppercase tracking-wider">Result</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((sig) => {
                const isExpanded = expandedId === sig.id;
                return (
                  <SignalRow key={sig.id ?? sig.timestamp} signal={sig} isExpanded={isExpanded} onToggle={() => toggleExpand(sig.id)} />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SignalRow({ signal: sig, isExpanded, onToggle }: { signal: Signal; isExpanded: boolean; onToggle: () => void }) {
  const scoreColor = sig.score >= 7 ? 'text-purple-400' : sig.score >= 5 ? 'text-yellow-400' : 'text-[--color-text-muted]';
  const executed = sig.resolved !== null && sig.resolved !== undefined;

  return (
    <>
      <tr
        onClick={onToggle}
        className={`border-b border-[var(--color-border)]/10 cursor-pointer transition-colors ${
          isExpanded ? 'bg-purple-500/[0.06]' : 'hover:bg-purple-500/[0.03]'
        }`}
      >
        <td className="py-1 px-3 text-center">
          <ChevronRight size={9} className={`text-[--color-text-muted] transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
        </td>
        <td className="py-1 font-mono text-[--color-text-muted] whitespace-nowrap">
          {sig.timestamp ? new Date(sig.timestamp).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '---'}
        </td>
        <td className={`py-1 text-center font-mono font-bold ${scoreColor}`}>{sig.score}</td>
        <td className="py-1 text-center">
          <span className={`inline-flex items-center gap-0.5 font-mono font-bold ${
            sig.direction === 'CALL' ? 'text-emerald-400' : 'text-red-400'
          }`}>
            {sig.direction === 'CALL' ? <ArrowUpRight size={9} /> : <ArrowDownRight size={9} />}
            {sig.direction === 'CALL' ? 'C' : 'P'}
          </span>
        </td>
        <td className="py-1 text-right font-mono tabular-nums">{sig.price?.toFixed(2) ?? '---'}</td>
        <td className="py-1 text-center">
          {executed ? (
            <span className="text-[8px] text-blue-400 bg-blue-500/10 px-1 py-0.5 rounded font-bold">EXEC</span>
          ) : (
            <span className="text-[8px] text-[--color-text-muted] bg-[--color-bg-active]/50 px-1 py-0.5 rounded">SKIP</span>
          )}
        </td>
        <td className="py-1 px-3 text-center">
          {sig.resolved ? (
            <span className={`inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[8px] font-bold ${
              sig.outcome === 'WIN' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
            }`}>
              {sig.outcome === 'WIN' ? 'W' : 'L'}
              {sig.pnl != null && <span className="ml-0.5">{formatPnL(sig.pnl)}</span>}
            </span>
          ) : (
            <span className="text-[8px] text-[--color-text-muted]">pending</span>
          )}
        </td>
      </tr>
      {isExpanded && (
        <tr className="border-b border-[var(--color-border)]/10">
          <td colSpan={7} className="px-3 py-2 bg-[var(--color-bg-hover)]/30">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1.5 text-[9px]">
              <Detail label="Signal ID" value={String(sig.id)} />
              <Detail label="Timestamp" value={sig.timestamp ? new Date(sig.timestamp).toLocaleString() : '---'} />
              <Detail label="Epoch" value={String(sig.epoch)} />
              <Detail label="Direction" value={sig.direction} />
              <Detail label="Score" value={String(sig.score)} />
              <Detail label="Contract Type" value={sig.contractType ?? '---'} />
              <Detail label="Contract ID" value={sig.contractId ?? '---'} />
              <Detail label="Trade ID" value={sig.tradeId != null ? String(sig.tradeId) : '---'} />
              <Detail label="RSI Score" value={String(sig.scoreRsi)} />
              <Detail label="BB Score" value={String(sig.scoreBb)} />
              <Detail label="EMA Score" value={String(sig.scoreEma)} />
              <Detail label="ROC Score" value={String(sig.scoreRoc)} />
              <Detail label="Momentum Score" value={String(sig.scoreMomentum)} />
              <Detail label="Spike Penalty" value={String(sig.scoreSpikePenalty)} />
              <Detail label="Resolved" value={sig.resolved ? 'Yes' : 'No'} />
              <Detail label="Outcome" value={sig.outcome ?? '---'} />
              <Detail label="PnL" value={sig.pnl != null ? formatPnL(sig.pnl) : '---'} />
              {sig.indicatorsJson && (
                <Detail label="Indicators" value={sig.indicatorsJson} />
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[--color-text-muted]">{label}:</span>
      <span className="font-mono text-[--color-text-primary] truncate">{value}</span>
    </div>
  );
}
