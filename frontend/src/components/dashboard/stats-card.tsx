'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface StatsCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: 'up' | 'down' | 'neutral';
  trendLabel?: string;
  accentColor?: 'emerald' | 'red' | 'blue' | 'amber' | 'purple';
  className?: string;
  animate?: boolean;
  delay?: number;
  sparklineData?: number[];
  previousValue?: string;
}

const accentConfig = {
  emerald: {
    bg: 'from-emerald-500/10 to-emerald-600/5',
    border: 'border-emerald-500/20 group-hover:border-emerald-500/40',
    icon: 'bg-emerald-500/10 text-emerald-400',
    text: 'text-emerald-400',
    dotBg: 'bg-emerald-500',
    glow: 'rgba(52,211,153,0.15)',
  },
  red: {
    bg: 'from-red-500/10 to-red-600/5',
    border: 'border-red-500/20 group-hover:border-red-500/40',
    icon: 'bg-red-500/10 text-red-400',
    text: 'text-red-400',
    dotBg: 'bg-red-500',
    glow: 'rgba(248,113,113,0.15)',
  },
  blue: {
    bg: 'from-blue-500/10 to-blue-600/5',
    border: 'border-blue-500/20 group-hover:border-blue-500/40',
    icon: 'bg-blue-500/10 text-blue-400',
    text: 'text-blue-400',
    dotBg: 'bg-blue-500',
    glow: 'rgba(96,165,250,0.15)',
  },
  amber: {
    bg: 'from-amber-500/10 to-amber-600/5',
    border: 'border-amber-500/20 group-hover:border-amber-500/40',
    icon: 'bg-amber-500/10 text-amber-400',
    text: 'text-amber-400',
    dotBg: 'bg-amber-500',
    glow: 'rgba(251,191,36,0.15)',
  },
  purple: {
    bg: 'from-purple-500/10 to-purple-600/5',
    border: 'border-purple-500/20 group-hover:border-purple-500/40',
    icon: 'bg-purple-500/10 text-purple-400',
    text: 'text-purple-400',
    dotBg: 'bg-purple-500',
    glow: 'rgba(168,85,247,0.15)',
  },
};

export function StatsCard({ title, value, subtitle, icon, trend, trendLabel, accentColor = 'blue', className, animate = true, delay = 0, sparklineData, previousValue }: StatsCardProps) {
  const accent = accentConfig[accentColor];
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);
  const prevValueRef = useRef(value);

  useEffect(() => {
    if (animate && value !== prevValueRef.current) {
      const dir = parseFloat(value.match(/[\d.-]+/g)?.[0] || '0') >=
        (parseFloat(prevValueRef.current.match(/[\d.-]+/g)?.[0] || '0')) ? 'up' : 'down';
      setFlash(dir);
      const t = setTimeout(() => setFlash(null), 600);
      prevValueRef.current = value;
      return () => clearTimeout(t);
    }
    prevValueRef.current = value;
  }, [value, animate]);

  return (
    <motion.div
      initial={animate ? { opacity: 0, y: 16 } : undefined}
      animate={animate ? { opacity: 1, y: 0 } : undefined}
      transition={{ duration: 0.4, delay: delay * 0.08, ease: [0.25, 0.1, 0.25, 1] }}
      className={cn('relative group', className)}
    >
      <div
        className="absolute -inset-px rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-sm"
        style={{ background: `radial-gradient(ellipse at top, ${accent.glow}, transparent 70%)` }}
      />
      <div
        className={cn(
          'relative bg-gradient-to-br from-[--color-bg-elevated] to-[#0f0f18] border rounded-xl p-4 overflow-hidden transition-all duration-300',
          accent.border,
          flash === 'up' && 'ring-1 ring-emerald-500/30',
          flash === 'down' && 'ring-1 ring-red-500/30',
        )}
      >
        <div className="absolute top-0 right-0 w-32 h-32 pointer-events-none opacity-[0.03]">
          <svg viewBox="0 0 200 200" fill="none">
            <defs>
              <filter id="glow-svg"><feGaussianBlur stdDeviation="12" /></filter>
            </defs>
            <rect x="120" y="0" width="70" height="70" rx="35" fill="currentColor" filter="url(#glow-svg)" />
            <ellipse cx="170" cy="80" rx="28" ry="12" fill="currentColor" opacity="0.5" />
            <polygon points="200,0 200,60 140,0" fill="currentColor" opacity="0.3" />
          </svg>
        </div>

        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-semibold text-[--color-text-muted] uppercase tracking-wider">
            {title}
          </span>
          <div className={cn('p-1.5 rounded-lg', accent.icon)}>
            {icon}
          </div>
        </div>

        <div className={cn('font-mono text-2xl font-bold tabular-nums relative', accent.text)}>
          {value}
          {flash && (
            <span className={`absolute -top-1 -right-2 text-[9px] ${flash === 'up' ? 'text-emerald-400' : 'text-red-400'} animate-bounce-in`}>
              {flash === 'up' ? '↑' : '↓'}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 mt-1.5">
          {trend && (
            <span className={cn(
              'inline-flex items-center gap-0.5 text-[10px] font-semibold',
              trend === 'up' ? 'text-emerald-400' : trend === 'down' ? 'text-red-400' : 'text-[--color-text-muted]',
            )}>
              {trend === 'up' ? <TrendingUp size={10} /> : trend === 'down' ? <TrendingDown size={10} /> : <Minus size={10} />}
              {trendLabel}
            </span>
          )}
          {subtitle && (
            <span className="text-[10px] text-[--color-text-muted]">{subtitle}</span>
          )}
          {previousValue && (
            <span className="text-[9px] text-[--color-text-muted] ml-auto">{previousValue}</span>
          )}
        </div>

        {sparklineData && sparklineData.length > 1 && (
          <div className="mt-2 h-6">
            <svg width="100%" height="100%" viewBox={`0 0 ${sparklineData.length} 100`} preserveAspectRatio="none">
              <defs>
                <linearGradient id={`sparkline-${title.replace(/\s/g, '')}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={accent.text.replace('text-', '').replace('-400', '') === 'emerald' ? '#34d399' : accent.text.replace('text-', '').replace('-400', '') === 'red' ? '#f87171' : '#60a5fa'} stopOpacity="0.4" />
                  <stop offset="100%" stopColor={accent.text.replace('text-', '').replace('-400', '') === 'emerald' ? '#34d399' : accent.text.replace('text-', '').replace('-400', '') === 'red' ? '#f87171' : '#60a5fa'} stopOpacity="0.02" />
                </linearGradient>
              </defs>
              <path
                d={`M ${sparklineData.map((d, i) => `${i},${100 - (d / Math.max(...sparklineData)) * 90 - 5}`).join(' L ')}`}
                fill="none"
                stroke={accent.text.replace('text-', '').replace('-400', '') === 'emerald' ? '#34d399' : accent.text.replace('text-', '').replace('-400', '') === 'red' ? '#f87171' : '#60a5fa'}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d={`M ${sparklineData.map((d, i) => `${i},${100 - (d / Math.max(...sparklineData)) * 90 - 5}`).join(' L ')} L ${sparklineData.length - 1},100 L 0,100 Z`}
                fill={`url(#sparkline-${title.replace(/\s/g, '')})`}
              />
            </svg>
          </div>
        )}
      </div>
    </motion.div>
  );
}
