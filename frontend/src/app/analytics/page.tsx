'use client';

import { motion } from 'framer-motion';
import { PerformanceMetrics } from '@/components/analytics/performance-metrics';
import { EquityCurve } from '@/components/analytics/equity-curve';
import { PnLDistribution } from '@/components/analytics/pnl-distribution';
import { ExitReasons } from '@/components/analytics/exit-reasons';
import { StreakTracker } from '@/components/analytics/streak-tracker';
import { TradeDuration } from '@/components/analytics/trade-duration';
import { SignalPerformance } from '@/components/analytics/signal-performance';
import { ParamSimulator } from '@/components/analytics/param-simulator';
import { ExportButton } from '@/components/analytics/export-button';

export default function AnalyticsPage() {
  return (
    <div className="space-y-4">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-lg font-bold text-[--color-text-primary]">Analytics</h1>
          <p className="text-[10px] text-[--color-text-muted] mt-0.5">
            Live performance metrics computed from all trades and signals
          </p>
        </div>
        <ExportButton />
      </motion.div>

      <PerformanceMetrics />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <EquityCurve />
        </div>
        <div className="lg:col-span-1">
          <StreakTracker />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <PnLDistribution />
        <ExitReasons />
        <TradeDuration />
      </div>

      <SignalPerformance />

      <ParamSimulator />
    </div>
  );
}
