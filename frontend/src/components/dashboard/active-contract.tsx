'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useBotStore } from '@/stores/bot-store';
import { formatCurrency } from '@/lib/format';

export function ActiveContract() {
  const activeContract = useBotStore((s) => s.activeContract);
  const lastTick = useBotStore((s) => s.lastTick);
  const sellContract = useBotStore((s) => s.sellContract);
  const [isSelling, setIsSelling] = useState(false);

  if (!activeContract) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-[--color-bg-elevated] border border-[--color-border] rounded-lg p-3 flex flex-col items-center justify-center gap-2 min-h-[100px]"
      >
        <div className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500" />
        </div>
        <div className="text-xs text-[--color-text-muted]">Awaiting signal...</div>
        <div className="text-[10px] text-[--color-text-muted]">No active contract</div>
      </motion.div>
    );
  }

  const isMultiplier = activeContract.contractType === 'MULTDOWN';
  const isFavorable = activeContract.direction === 'CALL'
    ? (lastTick?.quote || 0) >= activeContract.entryPrice
    : (lastTick?.quote || 0) <= activeContract.entryPrice;

  const currentValue = isMultiplier && lastTick && activeContract.multiplier
    ? activeContract.stake * (1 + activeContract.multiplier * (activeContract.entryPrice - lastTick.quote) / activeContract.entryPrice)
    : 0;

  const priceDiff = lastTick ? lastTick.quote - activeContract.entryPrice : 0;

  const handleSell = async () => {
    if (!activeContract?.contractId || isSelling) return;
    setIsSelling(true);
    try {
      await sellContract(activeContract.contractId);
    } catch (err) {
      console.error('Sell failed:', err);
    } finally {
      setIsSelling(false);
    }
  };

  const canSell = activeContract?.contractId && !isSelling;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-[--color-bg-elevated] border rounded-lg p-3 ${
        activeContract.direction === 'CALL' ? 'border-green-500/30' : 'border-red-500/30'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] font-medium text-[--color-text-secondary] uppercase tracking-wider">Active Contract</div>
        <div className="flex items-center gap-2">
          {isMultiplier && <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-purple-500/15 text-purple-400">MULTDOWN</span>}
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-2">
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
          activeContract.direction === 'CALL' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
        }`}>
          {activeContract.direction}
        </span>
        <span className="text-[10px] font-mono text-[--color-text-muted]">{activeContract.localId}</span>
      </div>

      <div className="space-y-1 text-xs">
        <div className="flex justify-between">
          <span className="text-[--color-text-muted]">Entry</span>
          <span className="font-mono">{formatCurrency(activeContract.entryPrice, 2)}</span>
        </div>
        {lastTick && (
          <div className="flex justify-between">
            <span className="text-[--color-text-muted]">Current</span>
            <motion.span
              key={lastTick.quote}
              initial={{ scale: 1.1 }}
              animate={{ scale: 1 }}
              className={`font-mono ${isFavorable ? 'text-green-500' : 'text-red-500'}`}
            >
              {lastTick.quote.toFixed(2)}
              <span className="ml-1">{isFavorable ? '▲' : '▼'}</span>
            </motion.span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-[--color-text-muted]">Diff</span>
          <span className={`font-mono ${priceDiff >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {priceDiff >= 0 ? '+' : ''}{priceDiff.toFixed(2)}
          </span>
        </div>
        {isMultiplier && currentValue > 0 && (
          <div className="flex justify-between">
            <span className="text-[--color-text-muted]">Contract Value</span>
            <motion.span
              key={currentValue}
              animate={{ scale: [1, 1.05, 1] }}
              className={`font-mono ${currentValue >= activeContract.stake ? 'text-green-500' : 'text-red-500'}`}
            >
              {formatCurrency(currentValue, 4)}
            </motion.span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-[--color-text-muted]">Stake</span>
          <span className="font-mono">{formatCurrency(activeContract.stake)}</span>
        </div>
        {isMultiplier && activeContract.multiplier && (
          <>
            <div className="flex justify-between">
              <span className="text-[--color-text-muted]">Multiplier</span>
              <span className="font-mono">x{activeContract.multiplier}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[--color-text-muted]">SL / TP</span>
              <span className="font-mono text-[10px]">{formatCurrency(activeContract.stopLoss)} / {formatCurrency(activeContract.takeProfit)}</span>
            </div>
          </>
        )}
      </div>

      {/* Manual Close Button */}
      {activeContract.contractId && (
        <div className="mt-3 pt-3 border-t border-[--color-border]">
          <button
            onClick={handleSell}
            disabled={!canSell}
            className={`w-full py-2 px-3 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-200 ${
              isSelling
                ? 'bg-yellow-500/20 text-yellow-400 cursor-wait'
                : 'bg-gradient-to-r from-orange-500 to-red-500 text-white hover:from-orange-600 hover:to-red-600 active:scale-95 shadow-lg shadow-orange-500/20'
            }`}
          >
            {isSelling ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Closing...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                Close Trade Now
              </span>
            )}
          </button>
          <div className="text-[9px] text-center text-[--color-text-muted] mt-1">
            Manual close - secures current profit/loss
          </div>
        </div>
      )}
    </motion.div>
  );
}
