'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useBotStore } from '@/stores/bot-store';
import { formatCurrency } from '@/lib/format';
import { X, Clock, TrendingUp, TrendingDown, Activity } from 'lucide-react';

function useElapsed(entryEpoch?: number) {
  const [elapsed, setElapsed] = useState('');
  const start = useRef(entryEpoch);
  start.current = entryEpoch || start.current;

  useEffect(() => {
    if (!start.current) return;
    const tick = () => {
      const s = Math.floor(Date.now() / 1000 - start.current!);
      const m = Math.floor(s / 60);
      const sec = s % 60;
      setElapsed(`${m}m ${sec.toString().padStart(2, '0')}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [entryEpoch]);

  return elapsed;
}

function contractValue(
  stake: number,
  multiplier: number | undefined,
  entryPrice: number,
  currentPrice: number,
  contractType: string | undefined,
  direction: 'CALL' | 'PUT',
): number | null {
  if (!multiplier || !currentPrice) return null;
  if (contractType === 'MULTDOWN' || (contractType !== 'MULTUP' && direction === 'PUT')) {
    return stake * (1 + multiplier * (entryPrice - currentPrice) / entryPrice);
  }
  return stake * (1 + multiplier * (currentPrice - entryPrice) / entryPrice);
}

export function ActiveContract() {
  const activeContract = useBotStore((s) => s.activeContract);
  const lastTick = useBotStore((s) => s.lastTick);
  const sellContract = useBotStore((s) => s.sellContract);
  const [sellState, setSellState] = useState<'idle' | 'selling' | 'done' | 'error'>('idle');
  const [sellError, setSellError] = useState('');
  const [now, setNow] = useState(Date.now());
  const sellDoneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const contract = activeContract;
  const tick = lastTick;

  const elapsed = useElapsed(contract?.entryEpoch);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!contract) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-[--color-bg-elevated] border border-[--color-border] rounded-xl p-5 flex flex-col items-center justify-center gap-3 min-h-[120px]"
      >
        <div className="relative flex h-3.5 w-3.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-60" />
          <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-blue-500" />
        </div>
        <div className="text-xs font-medium text-[--color-text-muted]">Awaiting signal...</div>
        <div className="text-[10px] text-[--color-text-muted]/60">Waiting for next entry</div>
      </motion.div>
    );
  }

  const isMultiplier = contract.contractType === 'MULTDOWN' || contract.contractType === 'MULTUP';
  const currentPrice = tick?.quote ?? 0;
  const entryPrice = contract.entryPrice;

  // Use real Deriv PnL when available (from proposal_open_contract stream).
  // This is the SINGLE SOURCE OF TRUTH — it matches exactly what the real
  // Deriv account shows. Only fall back to computed PnL when no stream data
  // has arrived yet (initial state before first contractUpdate).
  const hasDerivPnl = contract.derivProfit != null;
  const pnl = hasDerivPnl ? contract.derivProfit : (() => {
    const value = contractValue(
      contract.stake, contract.multiplier, entryPrice, currentPrice,
      contract.contractType, contract.direction,
    );
    return value != null ? value - contract.stake : null;
  })();

  const rawDiff = hasDerivPnl && contract.derivSpot != null
    ? contract.derivSpot - entryPrice
    : currentPrice - entryPrice;
  const isFavourable = contract.direction === 'CALL' ? rawDiff >= 0 : rawDiff <= 0;
  const directionArrow = isFavourable ? '▲' : '▼';

  // Recompute value for the display row; prefer Deriv source when available
  const displaySpot = hasDerivPnl && contract.derivSpot != null ? contract.derivSpot : currentPrice;
  const value = hasDerivPnl && contract.derivBidPrice != null
    ? contract.stake + contract.derivProfit
    : contractValue(contract.stake, contract.multiplier, entryPrice, displaySpot, contract.contractType, contract.direction);

  // Stale contract detection: if no contractUpdate received for 10+ seconds
  const isStale = contract.lastUpdate != null && now - contract.lastUpdate > 10_000;

  const handleSell = async () => {
    if (sellState !== 'idle' || !contract.contractId) return;
    setSellState('selling');
    setSellError('');
    try {
      const result = await sellContract(contract.contractId);
      if (result.success) {
        setSellState('done');
        sellDoneTimer.current = setTimeout(() => setSellState('idle'), 2000);
      } else {
        setSellState('error');
        setSellError(result.error || 'Sell failed');
        setTimeout(() => setSellState('idle'), 3000);
      }
    } catch {
      setSellState('error');
      setSellError('Request failed');
      setTimeout(() => setSellState('idle'), 3000);
    }
  };

  const pnlColor = pnl != null ? (pnl >= 0 ? 'text-emerald-400' : 'text-red-400') : 'text-[--color-text-muted]';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      layout
      className={`relative overflow-hidden rounded-xl border ${
        contract.direction === 'CALL' ? 'border-emerald-500/20' : 'border-red-500/20'
      } bg-[--color-bg-elevated]`}
    >
      {/* Top gradient line */}
      <div className={`absolute top-0 left-0 right-0 h-0.5 ${
        contract.direction === 'CALL' ? 'bg-gradient-to-r from-emerald-500/40 to-emerald-500/10' : 'bg-gradient-to-r from-red-500/40 to-red-500/10'
      }`} />

      {/* Header */}
      <div className="px-4 pt-3 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isStale ? 'bg-amber-400 opacity-80' : 'bg-green-400 opacity-60'}`} />
            <span className={`relative inline-flex rounded-full h-2 w-2 ${isStale ? 'bg-amber-500' : 'bg-green-500'}`} />
          </span>
          <span className={`text-[10px] font-semibold tracking-wide ${isStale ? 'text-amber-400' : 'text-green-400'}`}>
            {isStale ? 'STALE' : 'LIVE'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isMultiplier && (
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-purple-500/12 text-purple-300 border border-purple-500/20">
              {contract.contractType}
            </span>
          )}
          {contract.multiplier && (
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/15">
              x{contract.multiplier}
            </span>
          )}
        </div>
      </div>

      {/* Direction + ID */}
      <div className="px-4 pb-1 flex items-center gap-2.5">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
          contract.direction === 'CALL'
            ? 'bg-emerald-500/15 text-emerald-300'
            : 'bg-red-500/15 text-red-300'
        }`}>
          {contract.direction === 'CALL' ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
          {contract.direction}
        </span>
        <span className="text-[11px] font-mono text-[--color-text-muted]/70 tracking-wide">{contract.localId}</span>
      </div>

      {/* Main price block */}
      <div className="px-4 py-2 space-y-1.5">
        <div className="flex items-baseline justify-between">
          <span className="text-[10px] text-[--color-text-muted] font-medium">Entry</span>
          <span className="text-[13px] font-mono tabular-nums text-[--color-text-primary] tracking-tight">
            {formatCurrency(entryPrice, 2)}
          </span>
        </div>
        {(displaySpot > 0) && (
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] text-[--color-text-muted] font-medium">Current</span>
            <motion.span
              key={displaySpot}
              initial={{ scale: 1.08 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.15 }}
              className={`text-[13px] font-mono tabular-nums tracking-tight ${isFavourable ? 'text-emerald-400' : 'text-red-400'}`}
            >
              {displaySpot.toFixed(2)}
              <span className="ml-1 text-[10px]">{directionArrow}</span>
            </motion.span>
          </div>
        )}

        {/* Divider */}
        <div className="border-t border-[--color-border] my-2" />

        {/* P&L */}
        {pnl != null && (
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] text-[--color-text-muted] font-medium">P&amp;L</span>
            <motion.span
              key={pnl.toFixed(4)}
              initial={{ scale: 1.06 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.15 }}
              className={`text-[13px] font-mono tabular-nums font-semibold tracking-tight ${pnlColor}`}
            >
              {pnl >= 0 ? '+' : ''}{pnl.toFixed(4)}
              {contract.stake > 0 && (
                <span className="ml-1.5 text-[10px] opacity-80">
                  ({pnl >= 0 ? '+' : ''}{(pnl / contract.stake * 100).toFixed(2)}%)
                </span>
              )}
            </motion.span>
          </div>
        )}
      </div>

      {/* Details grid */}
      <div className="px-4 py-2 grid grid-cols-2 gap-x-4 gap-y-1.5">
        <div className="flex items-baseline justify-between">
          <span className="text-[9px] text-[--color-text-muted]">Stake</span>
          <span className="text-[11px] font-mono tabular-nums text-[--color-text-primary]">{formatCurrency(contract.stake)}</span>
        </div>
        {value != null && (
          <div className="flex items-baseline justify-between">
            <span className="text-[9px] text-[--color-text-muted]">Value</span>
            <span className={`text-[11px] font-mono tabular-nums ${pnlColor}`}>
              {formatCurrency(value, 4)}
            </span>
          </div>
        )}
        {isMultiplier && contract.stopLoss != null && (
          <div className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between">
              <span className="text-[9px] text-[--color-text-muted]">SL</span>
              <span className="text-[11px] font-mono tabular-nums text-red-400/80">
                -{formatCurrency(contract.stopLoss)}
              </span>
            </div>
            {pnl != null && (
              <div className="h-1 rounded-full bg-red-500/10 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.min(100, Math.max(0, (-pnl / contract.stopLoss) * 100))}%`,
                    background: pnl <= -contract.stopLoss ? '#ef4444' : pnl < -contract.stopLoss * 0.7 ? '#f59e0b' : '#ef444480',
                  }}
                />
              </div>
            )}
          </div>
        )}
        {isMultiplier && contract.takeProfit != null && (
          <div className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between">
              <span className="text-[9px] text-[--color-text-muted]">TP</span>
              <span className="text-[11px] font-mono tabular-nums text-emerald-400/80">
                +{formatCurrency(contract.takeProfit)}
              </span>
            </div>
            {pnl != null && (
              <div className="h-1 rounded-full bg-emerald-500/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-400 transition-all duration-300"
                  style={{ width: `${Math.min(100, Math.max(0, (pnl / contract.takeProfit) * 100))}%` }}
                />
              </div>
            )}
          </div>
        )}
        <div className="flex items-baseline justify-between">
          <span className="text-[9px] text-[--color-text-muted]">Diff</span>
          <span className={`text-[11px] font-mono tabular-nums ${isFavourable ? 'text-emerald-400/80' : 'text-red-400/80'}`}>
            {rawDiff >= 0 ? '+' : ''}{rawDiff.toFixed(2)}
          </span>
        </div>
        {elapsed && (
          <div className="flex items-baseline justify-between">
            <span className="text-[9px] text-[--color-text-muted]">Duration</span>
            <span className="text-[11px] font-mono tabular-nums text-[--color-text-muted] flex items-center gap-1">
              <Clock size={9} className="opacity-60" />
              {elapsed}
            </span>
          </div>
        )}
      </div>

      {/* Close button */}
      {contract.contractId && (
        <div className="px-4 pt-1 pb-3">
          <button
            onClick={handleSell}
            disabled={sellState === 'selling' || sellState === 'done'}
            className={`
              w-full py-2 px-3 rounded-lg text-[11px] font-bold uppercase tracking-wider
              transition-all duration-200 flex items-center justify-center gap-2
              ${sellState === 'idle'
                ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white hover:from-orange-400 hover:to-red-400 active:scale-[0.97] shadow-lg shadow-red-500/15'
                : sellState === 'selling'
                  ? 'bg-amber-500/20 text-amber-300 cursor-wait border border-amber-500/30'
                  : sellState === 'done'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-red-500/20 text-red-300 border border-red-500/30'
              }
            `}
          >
            {sellState === 'idle' && (
              <><X size={12} /> Close Trade Now</>
            )}
            {sellState === 'selling' && (
              <><Activity size={12} className="animate-spin" /> Closing...</>
            )}
            {sellState === 'done' && (
              <><span className="text-emerald-300">✓</span> Closed</>
            )}
            {sellState === 'error' && (
              <><X size={12} /> {sellError || 'Failed'}</>
            )}
          </button>
          <div className="text-[8px] text-center text-[--color-text-muted]/50 mt-1.5 tracking-wider">
            Manual close secures current profit / loss
          </div>
        </div>
      )}
    </motion.div>
  );
}
