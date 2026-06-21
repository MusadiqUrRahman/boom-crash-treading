'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  Activity, Receipt, BarChart3, FlaskConical, Settings2, LineChart,
  TrendingUp, HeartPulse,
} from 'lucide-react';

const navItems = [
  { icon: Activity, label: 'Live', href: '/' },
  { icon: TrendingUp, label: 'Analytics', href: '/analytics' },
  { icon: Receipt, label: 'Trades', href: '/trades' },
  { icon: BarChart3, label: 'Reports', href: '/reports' },
  { icon: FlaskConical, label: 'Backtest', href: '/backtest' },
  { icon: HeartPulse, label: 'Health', href: '/health' },
  { icon: Settings2, label: 'Config', href: '/settings' },
  { icon: LineChart, label: 'Optimize', href: '/optimization' },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="w-[220px] shrink-0 border-r border-[--color-border] bg-[--color-bg] flex flex-col"
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[--color-border]">
        <div className="w-6 h-6 rounded bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center">
          <span className="text-blue-50 text-[10px] font-bold">BC</span>
        </div>
        <span className="text-sm font-semibold text-[--color-text-primary]">BotDash</span>
      </div>

      <nav className="flex-1 py-2">
        {navItems.map((item, idx) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <motion.div
              key={item.href}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.04, duration: 0.25 }}
            >
              <Link
                href={item.href}
                className={cn(
                  "group flex items-center gap-3 px-4 py-2.5 text-sm transition-all duration-100",
                  isActive
                    ? "text-[--color-accent] bg-gradient-to-r from-[--color-accent-muted] to-transparent border-r-2 border-[--color-accent] shadow-[inset_0_0_40px_-6px_rgba(59,130,246,0.25)]"
                    : "text-[--color-text-secondary] hover:text-[--color-text-primary] hover:bg-[--color-bg-hover] hover:pl-5 hover:shadow-[inset_0_0_30px_-8px_rgba(59,130,246,0.15)]"
                )}
              >
                <Icon
                  size={16}
                  strokeWidth={isActive ? 2 : 1.5}
                  className={cn(
                    "transition-all duration-100",
                    isActive
                      ? "text-[--color-accent] drop-shadow-[0_0_10px_rgba(59,130,246,0.6)]"
                      : "group-hover:text-[var(--color-accent-hover)] group-hover:drop-shadow-[0_0_8px_rgba(59,130,246,0.4)]"
                  )}
                />
                <span className={cn("transition-all duration-100", isActive ? "drop-shadow-[0_0_6px_rgba(59,130,246,0.35)]" : "group-hover:drop-shadow-[0_0_4px_rgba(59,130,246,0.3)]")}>{item.label}</span>
                {isActive && (
                  <motion.div
                    layoutId="activeIndicator"
                    className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-[--color-accent] rounded-full"
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  />
                )}
              </Link>
            </motion.div>
          );
        })}
      </nav>

      <div className="px-4 py-3 border-t border-[--color-border]">
        <span className="text-[10px] text-[--color-text-muted]">v1.0.0</span>
      </div>
    </motion.div>
  );
}
