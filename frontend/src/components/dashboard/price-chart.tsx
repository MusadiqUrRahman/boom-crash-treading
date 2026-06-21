'use client';

import { useEffect, useRef } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi, LineStyle, LineSeries, type UTCTimestamp } from 'lightweight-charts';
import { useBotStore } from '@/stores/bot-store';
import { motion } from 'framer-motion';

export function PriceChart() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const lineSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const bbUpperRef = useRef<ISeriesApi<'Line'> | null>(null);
  const bbLowerRef = useRef<ISeriesApi<'Line'> | null>(null);
  const bbMiddleRef = useRef<ISeriesApi<'Line'> | null>(null);
  const emaShortRef = useRef<ISeriesApi<'Line'> | null>(null);
  const emaLongRef = useRef<ISeriesApi<'Line'> | null>(null);

  const ticks = useBotStore((s) => s.ticks);
  const indicators = useBotStore((s) => s.indicators);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#0c0c18' },
        textColor: '#484870',
        fontFamily: "'Geist Mono', 'JetBrains Mono', monospace",
      },
      grid: {
        vertLines: { color: 'rgba(59,130,246,0.04)' },
        horzLines: { color: 'rgba(59,130,246,0.04)' },
      },
      crosshair: {
        vertLine: { color: '#3b82f6', width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#3b82f6' },
        horzLine: { color: '#3b82f6', width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#3b82f6' },
      },
      rightPriceScale: {
        borderColor: '#1a1a35',
        scaleMargins: { top: 0.05, bottom: 0.15 },
      },
      timeScale: {
        borderColor: '#1a1a35',
        timeVisible: true,
        secondsVisible: false,
      },
      width: chartContainerRef.current.clientWidth,
      height: 420,
    });

    const lineSeries = chart.addSeries(LineSeries, {
      color: '#3b82f6',
      lineWidth: 2,
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
      crosshairMarkerBorderColor: '#3b82f6',
      crosshairMarkerBackgroundColor: '#0c0c18',
    });

    const bbUpper = chart.addSeries(LineSeries, {
      color: 'rgba(59, 130, 246, 0.25)',
      lineWidth: 1,
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
      lastValueVisible: false,
    });

    const bbMiddle = chart.addSeries(LineSeries, {
      color: 'rgba(59, 130, 246, 0.12)',
      lineWidth: 1,
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
      lastValueVisible: false,
    });

    const bbLower = chart.addSeries(LineSeries, {
      color: 'rgba(59, 130, 246, 0.25)',
      lineWidth: 1,
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
      lastValueVisible: false,
    });

    const emaShort = chart.addSeries(LineSeries, {
      color: '#f59e0b',
      lineWidth: 1,
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
      lastValueVisible: false,
    });

    const emaLong = chart.addSeries(LineSeries, {
      color: 'rgba(139, 92, 246, 0.5)',
      lineWidth: 1,
      priceFormat: { type: 'price', precision: 2, minMove: 0.01 },
      lastValueVisible: false,
    });

    chartRef.current = chart;
    lineSeriesRef.current = lineSeries;
    bbUpperRef.current = bbUpper;
    bbLowerRef.current = bbLower;
    bbMiddleRef.current = bbMiddle;
    emaShortRef.current = emaShort;
    emaLongRef.current = emaLong;

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);

  useEffect(() => {
    if (!lineSeriesRef.current || ticks.length === 0) return;
    const seen = new Set<number>();
    const unique = ticks.filter((t) => {
      if (seen.has(t.epoch)) return false;
      seen.add(t.epoch);
      return true;
    });
    if (unique.length === 0) return;
    lineSeriesRef.current.setData(
      unique.map((t) => ({ time: t.epoch as UTCTimestamp, value: t.quote }))
    );
  }, [ticks]);

  useEffect(() => {
    if (!indicators || ticks.length === 0) return;
    const time = ticks[ticks.length - 1].epoch as UTCTimestamp;

    if (indicators.bb) {
      bbUpperRef.current?.update({ time, value: indicators.bb.upper });
      bbMiddleRef.current?.update({ time, value: indicators.bb.middle });
      bbLowerRef.current?.update({ time, value: indicators.bb.lower });
    }

    if (indicators.emaShort !== null) {
      emaShortRef.current?.update({ time, value: indicators.emaShort });
    }
    if (indicators.emaLong !== null) {
      emaLongRef.current?.update({ time, value: indicators.emaLong });
    }
  }, [indicators, ticks]);

  if (ticks.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-[--color-bg-elevated] border border-[--color-border] rounded-lg p-3"
      >
        <div className="flex items-center gap-2 mb-3">
          <div className="text-[11px] font-medium text-[--color-text-secondary] uppercase tracking-wider">Price Chart</div>
          <div className="flex items-center gap-3 ml-auto text-[9px] text-[--color-text-muted]">
            <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-blue-500 rounded" /> Price</span>
            <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-amber-500 rounded" /> EMA</span>
            <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-purple-500/50 rounded" /> BB</span>
          </div>
        </div>
        <div className="flex items-center justify-center h-[420px] text-xs text-[--color-text-muted]">
          <div className="flex flex-col items-center gap-2">
            <div className="w-5 h-5 border-2 border-blue-500/30 border-t-blue-400 rounded-full animate-spin" />
            <span>Waiting for tick data...</span>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.1 }}
      className="bg-[--color-bg-elevated] border border-[--color-border] rounded-lg p-3"
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="text-[11px] font-medium text-[--color-text-secondary] uppercase tracking-wider">Price Chart</div>
        <div className="flex items-center gap-3 ml-auto text-[9px] text-[--color-text-muted]">
          <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-blue-500 rounded" /> Price</span>
          <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-amber-500 rounded" /> EMA</span>
          <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-purple-500/50 rounded" /> BB</span>
        </div>
      </div>
      <div ref={chartContainerRef} />
    </motion.div>
  );
}
