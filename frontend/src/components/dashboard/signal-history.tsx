'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useBotStore } from '@/stores/bot-store';
import { getWsClient } from '@/lib/ws-client';
import { formatPnL } from '@/lib/format';
import type { Signal, WsMessage, SignalStats } from '@/types';
import { Zap, TrendingUp, TrendingDown, Activity } from 'lucide-react';

export function SignalHistory() {
  const storeSignals = useBotStore((s) => s.signals);
  const setSignals = useBotStore((s) => s.setSignals);
  const signalStats = useBotStore((s) => s.signalStats);
  const setSignalStats = useBotStore((s) => s.setSignalStats);
  const [loading, setLoading] = useState(true);

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

  const signals = storeSignals.slice(0, 50);
  const totalScore = signals.reduce((s, sig) => s + sig.score, 0);
  const avgScore = signals.length > 0 ? (totalScore / signals.length).toFixed(1) : '0.0';
  const hitRate = signalStats && signalStats.resolved > 0
    ? (signalStats.winRate * 100).toFixed(1)
    : '---';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.3 }}
      className="glass-card rounded-2xl p-5"
    >
      <div className="flex items-center gap-2.5 mb-4">
        <div className="p-2 rounded-lg bg-purple-500/10">
          <Zap size={15} className="text-purple-400" />
        </div>
        <span className="text-[11px] font-semibold text-[--color-text-muted] uppercase tracking-wider">Signal History</span>
        <div className="flex items-center gap-3 ml-auto text-[10px] font-mono">
          {signalStats && (
            <>
              <span className="text-[--color-text-muted]">{signalStats.total} signals</span>
              <span className="flex items-center gap-1 text-emerald-400">
                <TrendingUp size={10} /> {signalStats.wins}W
              </span>
              <span className="flex items-center gap-1 text-red-400">
                <TrendingDown size={10} /> {signalStats.losses}L
              </span>
              <span className="text-[--color-text-muted]">
                <Activity size={10} className="inline mr-0.5" />
                {hitRate}% hit
              </span>
              <span className="text-[--color-text-muted]">avg {avgScore}</span>
            </>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-4 h-4 border-2 border-purple-500/30 border-t-purple-400 rounded-full animate-spin" />
        </div>
      ) : signals.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-xs text-[--color-text-muted]">
          <Zap size={20} className="mb-2 opacity-40" />
          <div>No signals generated yet</div>
          <div className="text-[10px] mt-1">Signals appear when the bot detects trade opportunities</div>
        </div>
      ) : (
        <div className="overflow-x-auto -mx-5 px-5 max-h-[320px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-[--color-bg-elevated] z-10">
              <tr className="text-[--color-text-muted] border-b border-[--color-border]">
                <th className="text-left py-2 pr-2 font-medium text-[10px] uppercase tracking-wider">Time</th>
                <th className="text-left py-2 px-2 font-medium text-[10px] uppercase tracking-wider">Score</th>
                <th className="text-left py-2 px-2 font-medium text-[10px] uppercase tracking-wider">Dir</th>
                <th className="text-right py-2 px-2 font-medium text-[10px] uppercase tracking-wider">Price</th>
                <th className="text-center py-2 pl-2 font-medium text-[10px] uppercase tracking-wider">Outcome</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {signals.map((sig, idx) => {
                  const scoreColor = sig.score >= 5 ? 'text-purple-400' : sig.score >= 3 ? 'text-yellow-400' : 'text-[--color-text-muted]';
                  const strength = sig.score >= 5 ? 'Strong' : sig.score >= 3 ? 'Medium' : 'Weak';
                  return (
                    <motion.tr
                      key={sig.id ?? idx}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.2, delay: Math.min(idx * 0.015, 0.4) }}
                      className="border-b border-[--color-border]/20 hover:bg-purple-500/[0.02] transition-colors"
                    >
                      <td className="py-2 pr-2 font-mono text-[--color-text-muted] text-[10px]">
                        {sig.timestamp ? new Date(sig.timestamp).toLocaleTimeString('en-US', { hour12: false }) : '---'}
                      </td>
                      <td className={`py-2 px-2 font-mono font-bold ${scoreColor}`}>
                        {sig.score}
                        <span className="text-[9px] ml-1 opacity-70">{strength}</span>
                      </td>
                      <td className={`py-2 px-2 font-mono font-bold ${
                        sig.direction === 'CALL' ? 'text-emerald-400' : 'text-red-400'
                      }`}>
                        {sig.direction}
                      </td>
                      <td className="py-2 px-2 font-mono text-right">{sig.price?.toFixed(2) ?? '---'}</td>
                      <td className="py-2 pl-2 text-center">
                        {sig.resolved ? (
                          <motion.span
                            initial={{ scale: 0.8 }}
                            animate={{ scale: 1 }}
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              sig.outcome === 'WIN'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : 'bg-red-500/10 text-red-400 border border-red-500/20'
                            }`}>
                            {sig.outcome === 'WIN' ? 'W' : 'L'}
                            {sig.pnl != null && <span className="ml-0.5">{formatPnL(sig.pnl)}</span>}
                          </motion.span>
                        ) : (
                          <span className="text-[10px] text-[--color-text-muted]">pending</span>
                        )}
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      )}
    </motion.div>
  );
}
