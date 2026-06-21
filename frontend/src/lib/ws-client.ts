'use client';

import type { WsMessage, WsRequest } from '@/types';

type MessageHandler = (msg: WsMessage) => void;

class WsClient {
  private url: string;
  private ws: WebSocket | null = null;
  private handlers: Set<MessageHandler> = new Set();
  private requestIdCounter = 0;
  private pendingMessages: Array<{ requestId: string; action: string; params?: Record<string, unknown> }> = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 20;
  private intentionalClose = false;
  private onStatusChange: ((connected: boolean, reconnecting: boolean, error: string | null) => void) | null = null;
  private lastMessageTime = 0;

  constructor(url: string) {
    this.url = url;
  }

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    this.intentionalClose = false;

    try {
      this.ws = new WebSocket(this.url);
    } catch (err) {
      this.onStatusChange?.(false, false, `Connection failed: ${err}`);
      return;
    }

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.lastMessageTime = Date.now();
      this.onStatusChange?.(true, false, null);
      this._flushPending();
      this._startHeartbeat();
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as WsMessage;
        this.lastMessageTime = Date.now();
        this.handlers.forEach((h) => h(msg));
      } catch (err) {
        if (typeof console !== 'undefined') {
          console.error('[WsClient] Failed to parse message:', err);
        }
      }
    };

    this.ws.onclose = () => {
      this._stopHeartbeat();
      if (!this.intentionalClose) {
        this._scheduleReconnect();
      } else {
        this.onStatusChange?.(false, false, null);
      }
    };

    this.ws.onerror = () => {
      if (this.ws?.readyState === WebSocket.CLOSED && !this.intentionalClose) {
        this._scheduleReconnect();
      }
    };
  }

  disconnect() {
    this.intentionalClose = true;
    this._stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.reconnectAttempts = 0;
    this.onStatusChange?.(false, false, null);
  }

  send(action: string, params?: Record<string, unknown>): string {
    const requestId = `req-${++this.requestIdCounter}`;
    const msg: WsRequest = { type: 'request', requestId, action, params };
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      if (this.pendingMessages.length < 100) {
        this.pendingMessages.push({ requestId, action, params });
      }
    }
    return requestId;
  }

  subscribe(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  onConnectionChange(cb: (connected: boolean, reconnecting: boolean, error: string | null) => void) {
    this.onStatusChange = cb;
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private _startHeartbeat() {
    this._stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        if (Date.now() - this.lastMessageTime > 30000) {
          this.intentionalClose = false;
          this.ws.close();
        }
      }
    }, 15000);
  }

  private _stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private _flushPending() {
    if (this.pendingMessages.length === 0) return;
    const batch = this.pendingMessages.splice(0);
    for (const { requestId, action, params } of batch) {
      const msg: WsRequest = { type: 'request', requestId, action, params };
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(msg));
      }
    }
  }

  private _scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.onStatusChange?.(false, false, 'Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const base = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30000);
    const jitter = Math.random() * 1000;
    const delay = base + jitter;
    this.onStatusChange?.(false, true, null);

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }
}

let clientInstance: WsClient | null = null;

export function getWsClient(): WsClient {
  if (!clientInstance) {
    clientInstance = new WsClient(`ws://${typeof window !== 'undefined' ? window.location.hostname : 'localhost'}:3457`);
  }
  return clientInstance;
}
