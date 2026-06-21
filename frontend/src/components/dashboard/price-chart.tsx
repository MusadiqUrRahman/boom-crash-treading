'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useBotStore } from '@/stores/bot-store';
import { motion } from 'framer-motion';

const MAX_TICKS = 100;
const COLORS = {
  bg: '#0c0c18',
  line: '#3b82f6',
  lineGlow: 'rgba(59,130,246,0.15)',
  grid: 'rgba(59,130,246,0.06)',
  text: '#484870',
  textBright: '#8888aa',
  crosshair: 'rgba(59,130,246,0.4)',
  up: '#22c55e',
  down: '#ef4444',
};

export function PriceChart() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const ticks = useBotStore((s) => s.ticks);
  const ticksRef = useRef(ticks);
  ticksRef.current = ticks;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const w = container.clientWidth;
    const h = 320;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const data = ticksRef.current.slice(-MAX_TICKS);
    if (data.length < 2) {
      ctx.fillStyle = COLORS.text;
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('Waiting for ticks...', w / 2, h / 2);
      return;
    }

    const pad = { top: 20, right: 60, bottom: 24, left: 8 };
    const cw = w - pad.left - pad.right;
    const ch = h - pad.top - pad.bottom;

    const prices = data.map((t) => t.quote);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min || 1;
    const padRange = range * 0.1;
    const yMin = min - padRange;
    const yMax = max + padRange;
    const yRange = yMax - yMin;

    const toX = (i: number) => pad.left + (i / (data.length - 1)) * cw;
    const toY = (v: number) => pad.top + (1 - (v - yMin) / yRange) * ch;

    ctx.clearRect(0, 0, w, h);

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (i / 4) * ch;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(w - pad.right, y);
      ctx.stroke();

      const val = yMax - (i / 4) * yRange;
      ctx.fillStyle = COLORS.text;
      ctx.font = '10px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(val.toFixed(2), w - pad.right + 6, y + 3);
    }

    ctx.beginPath();
    ctx.moveTo(toX(0), toY(prices[0]));
    for (let i = 1; i < prices.length; i++) {
      ctx.lineTo(toX(i), toY(prices[i]));
    }
    ctx.strokeStyle = COLORS.line;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(toX(0), toY(prices[0]));
    for (let i = 1; i < prices.length; i++) {
      ctx.lineTo(toX(i), toY(prices[i]));
    }
    ctx.lineTo(toX(prices.length - 1), pad.top + ch);
    ctx.lineTo(toX(0), pad.top + ch);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + ch);
    grad.addColorStop(0, COLORS.lineGlow);
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.fill();

    const lastI = prices.length - 1;
    const lastX = toX(lastI);
    const lastY = toY(prices[lastI]);
    const prevPrice = prices.length >= 2 ? prices[prices.length - 2] : prices[lastI];
    const dotColor = prices[lastI] >= prevPrice ? COLORS.up : COLORS.down;

    ctx.beginPath();
    ctx.arc(lastX, lastY, 3, 0, Math.PI * 2);
    ctx.fillStyle = dotColor;
    ctx.fill();

    ctx.beginPath();
    ctx.setLineDash([3, 3]);
    ctx.moveTo(lastX, pad.top);
    ctx.lineTo(lastX, pad.top + ch);
    ctx.strokeStyle = COLORS.crosshair;
    ctx.lineWidth = 0.5;
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = COLORS.textBright;
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(prices[lastI].toFixed(2), lastX + 6, lastY - 8);

    if (data.length > 1) {
      const first = data[0];
      const last = data[data.length - 1];
      const diff = last.quote - first.quote;
      const pct = ((diff / first.quote) * 100).toFixed(3);
      ctx.fillStyle = diff >= 0 ? COLORS.up : COLORS.down;
      ctx.font = '10px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${diff >= 0 ? '+' : ''}${diff.toFixed(2)} (${diff >= 0 ? '+' : ''}${pct}%)`, w - pad.right, pad.top - 6);
    }
  }, []);

  useEffect(() => {
    draw();
  }, [ticks, draw]);

  useEffect(() => {
    const onResize = () => draw();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [draw]);

  if (ticks.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-[--color-bg-elevated] border border-[--color-border] rounded-lg p-3"
      >
        <div className="flex items-center gap-2 mb-3">
          <div className="text-[11px] font-medium text-[--color-text-secondary] uppercase tracking-wider">Price</div>
        </div>
        <div className="flex items-center justify-center h-[320px] text-xs text-[--color-text-muted]">
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
        <div className="text-[11px] font-medium text-[--color-text-secondary] uppercase tracking-wider">Price</div>
        <div className="flex items-center gap-3 ml-auto text-[9px] text-[--color-text-muted]">
          <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-blue-500 rounded" /> BOOM1000</span>
          <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-green-500 rounded" /> Up</span>
          <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-red-500 rounded" /> Down</span>
        </div>
      </div>
      <div ref={containerRef}>
        <canvas ref={canvasRef} className="rounded" />
      </div>
    </motion.div>
  );
}
