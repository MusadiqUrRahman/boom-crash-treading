'use client';

import { create } from 'zustand';
import { getWsClient } from '@/lib/ws-client';
import type {
  BotState, ConnectionState, RiskStatus, SessionStatus,
  Tick, Indicators, Trade, ActiveContract, BotConfig, ScoreState,
  PaginatedTrades, TodayStats, Signal, SignalStats, ContractUpdate,
} from '@/types';

interface BotStore {
  state: BotState;
  tickIndex: number;
  connectionState: ConnectionState;
  indicatorsReady: boolean;
  activeContracts: number;
  config: BotConfig | null;
  risk: RiskStatus | null;
  session: SessionStatus | null;
  ticks: Tick[];
  lastTick: Tick | null;
  indicators: Indicators | null;
  trades: Trade[];
  activeContract: ActiveContract | null;
  score: ScoreState | null;
  isInitialLoad: boolean;
  todayStats: TodayStats | null;
  tradePage: number;
  tradePages: number;
  tradeTotal: number;
  signals: Signal[];
  signalStats: SignalStats | null;

  updateStatus: (status: {
    state: BotState;
    tickIndex: number;
    connectionState: ConnectionState;
    bufferSize: number;
    indicatorsReady: boolean;
    activeContracts: number;
    risk: RiskStatus;
    session: SessionStatus;
  }) => void;
  addTick: (tick: Tick) => void;
  addTicks: (ticks: Tick[]) => void;
  updateIndicators: (indicators: Indicators) => void;
  setActiveContract: (contract: ActiveContract | null) => void;
  addTradeFromDb: (trades: Trade[]) => void;
  addTradeResolved: (result: import('@/types').TradeResolvedEvent, config: BotConfig) => void;
  setConfig: (config: BotConfig) => void;
  setScore: (score: ScoreState | null) => void;
  setInitialLoad: (loaded: boolean) => void;
  setTodayStats: (stats: TodayStats) => void;
  setTradePage: (data: PaginatedTrades) => void;
  addSignal: (signal: Signal) => void;
  setSignals: (signals: Signal[]) => void;
  setSignalStats: (stats: SignalStats) => void;
  updateActiveContractPnl: (update: ContractUpdate) => void;
  sellContract: (contractId: string) => Promise<{ success: boolean; error?: string }>;
}

let tradeKeyCounter = 0;
function nextTradeKey() { return `tk-${++tradeKeyCounter}`; }

const MAX_TICKS = 500;
const MAX_TRADES = 500;
const MAX_SIGNALS = 200;

export const useBotStore = create<BotStore>((set, get) => ({
  state: 'DISCONNECTED',
  tickIndex: 0,
  connectionState: 'DISCONNECTED',
  indicatorsReady: false,
  activeContracts: 0,
  config: null,
  risk: null,
  session: null,
  ticks: [],
  lastTick: null,
  indicators: null,
  trades: [],
  activeContract: null,
  score: null,
  isInitialLoad: false,
  todayStats: null,
  tradePage: 1,
  tradePages: 0,
  tradeTotal: 0,
  signals: [],
  signalStats: null,

  updateStatus: (status) => set({
    state: status.state,
    tickIndex: status.tickIndex,
    connectionState: status.connectionState,
    indicatorsReady: status.indicatorsReady,
    activeContracts: status.activeContracts,
    risk: status.risk,
    session: status.session,
  }),

  addTick: (tick) => set((state) => {
    if (state.lastTick && tick.epoch <= state.lastTick.epoch) return {};
    const ticks = [...state.ticks, tick];
    if (ticks.length > MAX_TICKS) ticks.splice(0, ticks.length - MAX_TICKS);
    return { ticks, lastTick: tick };
  }),

  addTicks: (ticks) => set((state) => {
    const lastEpoch = state.lastTick?.epoch ?? 0;
    const newTicks = ticks.filter(t => t.epoch > lastEpoch);
    if (newTicks.length === 0) return {};
    const merged = [...state.ticks, ...newTicks];
    if (merged.length > MAX_TICKS) merged.splice(0, merged.length - MAX_TICKS);
    return { ticks: merged, lastTick: newTicks[newTicks.length - 1] };
  }),

  updateIndicators: (indicators) => set({ indicators }),

  setActiveContract: (contract) => set({ activeContract: contract }),

  addTradeFromDb: (incoming) => set((state) => {
    const existingKeys = new Map(state.trades.map(t => [t.localId || t.contractId, t]));
    const newTrades: Trade[] = [];

    for (const t of incoming) {
      const id = t.localId || t.contractId;
      if (!id) continue;
      const existing = existingKeys.get(id);
      if (existing) {
        if (existing.win !== t.win || existing.pnl !== t.pnl || existing.exitPrice !== t.exitPrice || existing.exitReason !== t.exitReason) {
          existingKeys.set(id, { ...existing, ...t, _key: existing._key });
        }
      } else {
        newTrades.push(t);
        existingKeys.set(id, t);
      }
    }

    if (newTrades.length === 0 && state.trades.every(t => existingKeys.get(t.localId || t.contractId) === t)) return {};

    const front = newTrades.map(t => ({ ...t, _key: t._key || nextTradeKey() }));
    const rest = state.trades
      .filter(t => !front.some(f => (f.localId || f.contractId) === (t.localId || t.contractId)))
      .map(t => {
        const updated = existingKeys.get(t.localId || t.contractId);
        return updated !== t ? { ...updated!, _key: t._key } : t;
      });
    const merged = [...front, ...rest];
    if (merged.length > MAX_TRADES) merged.splice(MAX_TRADES);
    return { trades: merged };
  }),

  addTradeResolved: (result, config) => {
    const state = get();
    const id = result.localId || result.contractId;
    if (!id) return;
    const risk = state.risk;
    const existing = state.trades.find(t => t.localId === id || t.contractId === id);

    const trade: Trade = {
      _key: existing?._key || nextTradeKey(),
      localId: result.localId,
      contractId: result.contractId,
      symbol: config.symbol,
      direction: result.direction,
      stake: result.stake,
      payoutRate: config.payoutRate,
      entryPrice: result.entryPrice,
      exitPrice: result.exitPrice,
      entryEpoch: result.entryEpoch ?? (Math.floor(Date.now() / 1000) - result.durationTicks),
      exitEpoch: result.exitEpoch ?? Math.floor(Date.now() / 1000),
      durationTicks: result.durationTicks,
      score: result.score,
      scoreComponents: result.scoreComponents,
      win: result.win,
      pnl: result.pnl,
      balanceAfter: risk ? risk.balance + result.pnl : null,
      dryRun: config.dryRun,
      createdAt: existing?.createdAt || new Date().toISOString(),
      contractType: result.contractType,
      exitReason: result.exitReason,
    };

    set((s) => ({
      trades: [trade, ...s.trades.filter(t => t._key !== trade._key)].slice(0, MAX_TRADES),
      activeContract: null,
    }));
  },

  setConfig: (config) => set({ config }),

  setScore: (score) => set({ score }),

  setInitialLoad: (loaded) => set({ isInitialLoad: loaded }),

  setTodayStats: (stats) => set({ todayStats: stats }),

  setTradePage: (data) => set({
    tradePage: data.page,
    tradePages: data.pages,
    tradeTotal: data.total,
  }),

  addSignal: (signal) => set((state) => {
    const exists = state.signals.some(s => s.id === signal.id);
    if (exists) return {};
    return { signals: [signal, ...state.signals].slice(0, MAX_SIGNALS) };
  }),

  setSignals: (signals) => set({ signals: signals.slice(0, MAX_SIGNALS) }),

  setSignalStats: (stats) => set({ signalStats: stats }),

  updateActiveContractPnl: (update) => set((state) => {
    if (!state.activeContract) return {};
    if (state.activeContract.contractId !== update.contractId) return {};
    return {
      activeContract: {
        ...state.activeContract,
        derivProfit: update.profit,
        derivSpot: update.spot,
        derivBidPrice: update.bidPrice,
        lastUpdate: Date.now(),
      },
    };
  }),

  sellContract: async (contractId) => {
    try {
      const client = getWsClient();
      const resp = (await client.request('sellContract', { contractId })) as Record<string, unknown>;
      if (resp?.error) return { success: false, error: String(resp.error) };
      const inner = (resp?.data as Record<string, unknown>) || {};
      const success = inner?.success !== false;
      const message = inner?.message ? String(inner.message) : undefined;
      return {
        success,
        error: inner?.error ? String(inner.error) : success ? undefined : message || 'Sell failed',
        message,
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Request failed' };
    }
  },
}));
