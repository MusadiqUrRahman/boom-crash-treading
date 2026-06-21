'use client';

import React from 'react';
import { Sidebar } from './sidebar';
import { StatusBar } from './status-bar';
import { ConnectionBanner } from './connection-banner';
import { WebSocketProvider } from './ws-provider';
import { ErrorBoundary } from './error-boundary';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <WebSocketProvider>
      <div className="h-full flex flex-col">
        <StatusBar />
        <ConnectionBanner />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-auto p-4">
            <ErrorBoundary>
              {children}
            </ErrorBoundary>
          </main>
        </div>
      </div>
    </WebSocketProvider>
  );
}
