'use client';

import React from 'react';
import { useWebSocket } from '@/hooks/use-ws';

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  useWebSocket();
  return <>{children}</>;
}
