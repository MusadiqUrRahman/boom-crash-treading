'use client';

import { useState, useRef, useEffect } from 'react';
import { Download, ChevronDown } from 'lucide-react';
import { useBotStore } from '@/stores/bot-store';
import { exportTradesToCsv, exportSignalsToCsv, exportMetricsSnapshot } from '@/lib/export';

export function ExportButton() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const trades = useBotStore(s => s.trades);
  const signals = useBotStore(s => s.signals);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const items = [
    { label: 'Trades CSV', action: () => { exportTradesToCsv(trades); setOpen(false); }, disabled: trades.length === 0 },
    { label: 'Signals CSV', action: () => { exportSignalsToCsv(signals); setOpen(false); }, disabled: signals.length === 0 },
    { label: 'Performance Snapshot', action: () => { exportMetricsSnapshot(trades); setOpen(false); }, disabled: trades.length === 0 },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-[10px] text-[--color-text-muted] hover:text-[--color-text-primary] bg-[--color-bg-elevated] border border-[--color-border] rounded-lg px-2.5 py-1.5 transition-colors"
      >
        <Download size={12} />
        Export
        <ChevronDown size={10} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-44 bg-[--color-bg-elevated] border border-[--color-border] rounded-lg shadow-xl z-50 overflow-hidden">
          {items.map((item) => (
            <button
              key={item.label}
              onClick={item.action}
              disabled={item.disabled}
              className="w-full text-left px-3 py-2 text-[11px] text-[--color-text-primary] hover:bg-[--color-bg-hover] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
