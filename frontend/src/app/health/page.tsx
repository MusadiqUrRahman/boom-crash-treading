'use client';

import { useEffect, useState } from 'react';
import { useBotStore } from '@/stores/bot-store';
import { motion } from 'framer-motion';
import { Activity, Clock, MemoryStick, Wifi, Zap, AlertTriangle, RefreshCw } from 'lucide-react';

interface HealthData {
  status: string;
  uptime: number;
  version: string;
  lastTickEpoch: number;
  tickGap: number;
  connectionState: string;
  currentState: string;
  activeContract: { count: number } | null;
  dailyStats: { trades: number; wins: number; losses: number; pnl: number; maxDrawdown: number };
  riskLimits: { consecutiveLosses: number; dailyLoss: number; dailyTrades: number; dailyLossLimit: number; dailyTradeLimit: number };
  memoryUsage: string;
  config: { symbol: string; direction: string; stake: number; dryRun: boolean; durationTicks: number; scoreThreshold: number };
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

function Gauge({ value, label, max, color }: { value: number; label: string; max: number; color: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-16 h-16">
        <svg viewBox="0 0 64 64" className="transform -rotate-90">
          <circle cx="32" cy="32" r="26" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
          <circle cx="32" cy="32" r="26" fill="none" stroke={color} strokeWidth="4" strokeDasharray={`${(pct / 100) * 163.36} 163.36`} strokeLinecap="round" />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center font-mono text-xs font-bold">{value}</span>
      </div>
      <span className="text-[9px] text-[--color-text-muted]">{label}</span>
    </div>
  );
}

export default function HealthPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [error, setError] = useState(false);
  const state = useBotStore(s => s.state);
  const ticks = useBotStore(s => s.ticks);

  const fetchHealth = () => {
    fetch('http://127.0.0.1:3456/health')
      .then(r => r.json())
      .then(d => { setHealth(d); setError(false); })
      .catch(() => setError(true));
  };

  useEffect(() => {
    fetchHealth();
    const id = setInterval(fetchHealth, 5000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="space-y-4">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-lg font-bold text-[--color-text-primary]">Bot Health</h1>
          <p className="text-[10px] text-[--color-text-muted] mt-0.5">Live telemetry & system status</p>
        </div>
        <button
          onClick={fetchHealth}
          className="flex items-center gap-1.5 text-[10px] text-[--color-text-muted] hover:text-[--color-text-primary] transition-colors"
        >
          <RefreshCw size={12} />
          Refresh
        </button>
      </motion.div>

      {/* Connection & Status */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[--color-bg-elevated] border border-[--color-border] rounded-xl p-3"
        >
          <div className="flex items-center gap-2 mb-2">
            <Wifi size={12} className="text-[--color-text-muted]" />
            <span className="text-[10px] font-medium text-[--color-text-muted]">Connection</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex h-2 w-2 rounded-full ${health?.connectionState === 'AUTHORIZED' ? 'bg-emerald-400' : health?.connectionState === 'CONNECTING' ? 'bg-amber-400' : 'bg-red-400'}`} />
            <span className="font-mono text-sm">{health?.connectionState || state || 'unknown'}</span>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.04 }}
          className="bg-[--color-bg-elevated] border border-[--color-border] rounded-xl p-3"
        >
          <div className="flex items-center gap-2 mb-2">
            <Clock size={12} className="text-[--color-text-muted]" />
            <span className="text-[10px] font-medium text-[--color-text-muted]">Uptime</span>
          </div>
          <span className="font-mono text-sm">{health ? formatUptime(health.uptime) : '---'}</span>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="bg-[--color-bg-elevated] border border-[--color-border] rounded-xl p-3"
        >
          <div className="flex items-center gap-2 mb-2">
            <MemoryStick size={12} className="text-[--color-text-muted]" />
            <span className="text-[10px] font-medium text-[--color-text-muted]">Memory</span>
          </div>
          <span className="font-mono text-sm">{health ? `${health.memoryUsage} MB` : '---'}</span>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
          className="bg-[--color-bg-elevated] border border-[--color-border] rounded-xl p-3"
        >
          <div className="flex items-center gap-2 mb-2">
            <Activity size={12} className="text-[--color-text-muted]" />
            <span className="text-[10px] font-medium text-[--color-text-muted]">Tick Rate</span>
          </div>
          <span className="font-mono text-sm">
            {health
              ? health.tickGap < 0 ? 'N/A'
                : health.tickGap < 2 ? 'Live' : `${health.tickGap.toFixed(1)}s gap`
              : '---'}
          </span>
        </motion.div>
      </div>

      {/* Gauges row */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="bg-[--color-bg-elevated] border border-[--color-border] rounded-xl p-4"
      >
        <div className="flex items-center justify-between mb-4">
          <span className="text-[11px] font-semibold text-[--color-text-muted] uppercase tracking-wider">Risk Limits Status</span>
          {health?.config.dryRun && (
            <span className="text-[9px] text-amber-400 font-mono">DRY RUN</span>
          )}
        </div>

        <div className="flex items-center justify-around">
          {health && (
            <>
              <Gauge
                value={health.riskLimits.consecutiveLosses}
                label="Consec Losses"
                max={5}
                color={health.riskLimits.consecutiveLosses >= 3 ? '#f87171' : '#34d399'}
              />
              <Gauge
                value={Math.round((health.riskLimits.dailyLoss / health.riskLimits.dailyLossLimit) * 100)}
                label="Daily Loss %"
                max={100}
                color={health.riskLimits.dailyLoss / health.riskLimits.dailyLossLimit > 0.7 ? '#f87171' : health.riskLimits.dailyLoss / health.riskLimits.dailyLossLimit > 0.4 ? '#fbbf24' : '#34d399'}
              />
              <Gauge
                value={health.riskLimits.dailyTrades}
                label="Daily Trades"
                max={health.riskLimits.dailyTradeLimit}
                color={health.riskLimits.dailyTrades / health.riskLimits.dailyTradeLimit > 0.7 ? '#fbbf24' : '#60a5fa'}
              />
              <Gauge
                value={Math.round(health.dailyStats.maxDrawdown)}
                label="Drawdown %"
                max={30}
                color={health.dailyStats.maxDrawdown > 15 ? '#f87171' : '#34d399'}
              />
              <div className="flex flex-col items-center gap-1">
                <div className="relative w-16 h-16 flex items-center justify-center">
                  <span className="font-mono text-lg font-bold" style={{
                    color: health.dailyStats.pnl >= 0 ? '#34d399' : '#f87171',
                  }}>
                    ${health.dailyStats.pnl.toFixed(0)}
                  </span>
                </div>
                <span className="text-[9px] text-[--color-text-muted]">Today PnL</span>
              </div>
            </>
          )}
        </div>
      </motion.div>

      {/* Config snapshot */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-[--color-bg-elevated] border border-[--color-border] rounded-xl p-4"
      >
        <span className="text-[11px] font-semibold text-[--color-text-muted] uppercase tracking-wider mb-3 block">Active Config</span>
        {health ? (
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3 text-[10px]">
            {Object.entries(health.config).map(([key, val]) => (
              <div key={key}>
                <span className="text-[--color-text-muted] block">{key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}</span>
                <span className="font-mono text-[--color-text-primary]">{String(val)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-[--color-text-muted]">Connect to see config</p>
        )}
      </motion.div>

      {/* Live telemetry */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="bg-[--color-bg-elevated] border border-[--color-border] rounded-xl p-4"
      >
        <div className="flex items-center gap-2 mb-3">
          <Zap size={12} className="text-[--color-text-muted]" />
          <span className="text-[11px] font-semibold text-[--color-text-muted] uppercase tracking-wider">Tick Buffer Status</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[10px]">
          <div>
            <span className="text-[--color-text-muted] block">Buffer Size</span>
            <span className="font-mono text-[--color-text-primary]">{ticks.length.toLocaleString()} ticks</span>
          </div>
          <div>
            <span className="text-[--color-text-muted] block">Last Tick</span>
            <span className="font-mono text-[--color-text-primary]">
              {ticks.length > 0 ? new Date(ticks[ticks.length - 1].epoch * 1000).toLocaleTimeString() : '---'}
            </span>
          </div>
          <div>
            <span className="text-[--color-text-muted] block">Last Price</span>
            <span className="font-mono text-[--color-text-primary]">
              {ticks.length > 0 ? ticks[ticks.length - 1].quote.toFixed(5) : '---'}
            </span>
          </div>
          <div>
            <span className="text-[--color-text-muted] block">Version</span>
            <span className="font-mono text-[--color-text-primary]">{health?.version || '---'}</span>
          </div>
        </div>
      </motion.div>

      {error && (
        <div className="flex items-center gap-2 text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          <AlertTriangle size={12} />
          Cannot reach health endpoint at port 3456. The bot may be offline.
        </div>
      )}
    </div>
  );
}
