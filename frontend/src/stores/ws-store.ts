'use client';

import { create } from 'zustand';

interface WsStore {
  isConnected: boolean;
  isReconnecting: boolean;
  error: string | null;
  lastMessageAt: number | null;
  setConnected: (connected: boolean) => void;
  setReconnecting: (reconnecting: boolean) => void;
  setError: (error: string | null) => void;
  touch: () => void;
  reset: () => void;
}

export const useWsStore = create<WsStore>((set) => ({
  isConnected: false,
  isReconnecting: false,
  error: null,
  lastMessageAt: null,
  setConnected: (connected) => set({ isConnected: connected, isReconnecting: false, error: connected ? null : undefined }),
  setReconnecting: (reconnecting) => set({ isReconnecting: reconnecting }),
  setError: (error) => set({ error, isConnected: false, isReconnecting: false }),
  touch: () => set({ lastMessageAt: Date.now() }),
  reset: () => set({ isConnected: false, isReconnecting: false, error: null, lastMessageAt: null }),
}));
