'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useWsStore } from '@/stores/ws-store';
import { WifiOff, RefreshCw } from 'lucide-react';

export function ConnectionBanner() {
  const isConnected = useWsStore((s) => s.isConnected);
  const isReconnecting = useWsStore((s) => s.isReconnecting);
  const error = useWsStore((s) => s.error);

  return (
    <AnimatePresence>
      {!isConnected && (isReconnecting || error) && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.25 }}
          className={`flex items-center justify-center gap-2 px-4 py-1.5 text-xs font-medium overflow-hidden ${
            error
              ? 'bg-red-500/10 text-red-400 border-b border-red-500/20'
              : 'bg-amber-500/10 text-amber-400 border-b border-amber-500/20'
          }`}
        >
          {error ? (
            <motion.span
              initial={{ x: -8, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              className="flex items-center gap-2"
            >
              <WifiOff className="h-3 w-3" /> {error}
            </motion.span>
          ) : (
            <motion.span
              initial={{ x: -8, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              className="flex items-center gap-2"
            >
              <RefreshCw className="h-3 w-3 animate-spin" /> Reconnecting...
            </motion.span>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
