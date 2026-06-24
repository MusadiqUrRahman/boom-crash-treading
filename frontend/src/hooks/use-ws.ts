'use client';

import { useEffect, useCallback, useRef } from 'react';
import { getWsClient } from '@/lib/ws-client';
import { useWsStore } from '@/stores/ws-store';
import { useBotStore } from '@/stores/bot-store';
import type { WsMessage, BotStatus, Tick, Indicators, TradeResolvedEvent, TradeExecutedEvent, BotConfig, PaginatedTrades, TodayStats, Signal, ContractUpdate } from '@/types';

export function useWebSocket() {
  const setConnected = useWsStore((s) => s.setConnected);
  const setReconnecting = useWsStore((s) => s.setReconnecting);
  const setError = useWsStore((s) => s.setError);
  const touch = useWsStore((s) => s.touch);

  const updateStatus = useBotStore((s) => s.updateStatus);
  const addTick = useBotStore((s) => s.addTick);
  const addTicks = useBotStore((s) => s.addTicks);
  const updateIndicators = useBotStore((s) => s.updateIndicators);
  const setConfig = useBotStore((s) => s.setConfig);
  const addTradeFromDb = useBotStore((s) => s.addTradeFromDb);
  const addTradeResolved = useBotStore((s) => s.addTradeResolved);
  const setActiveContract = useBotStore((s) => s.setActiveContract);
  const setScore = useBotStore((s) => s.setScore);
  const isInitialLoad = useBotStore((s) => s.isInitialLoad);
  const setInitialLoad = useBotStore((s) => s.setInitialLoad);
  const setTodayStats = useBotStore((s) => s.setTodayStats);
  const setTradePage = useBotStore((s) => s.setTradePage);
  const addSignal = useBotStore((s) => s.addSignal);
  const setSignals = useBotStore((s) => s.setSignals);
  const setSignalStats = useBotStore((s) => s.setSignalStats);
  const updateActiveContractPnl = useBotStore((s) => s.updateActiveContractPnl);

  const fetchHistoricalData = useCallback(() => {
    const client = getWsClient();
    if (!client.isConnected()) return;
    client.send('getAllTrades', { page: 1, limit: 200 });
    client.send('getTodayStats');
    client.send('getDailyReports');
    client.send('getSignals', { limit: 100, offset: 0 });
    client.send('getSignalStats');
    client.send('getActiveContracts');
    setInitialLoad(true);
  }, [setInitialLoad]);

  const lastConnectedRef = useRef(false);
  const fetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const client = getWsClient();

    client.onConnectionChange((connected, reconnecting, error) => {
      if (error) setError(error);
      else if (reconnecting) {
        setReconnecting(true);
        lastConnectedRef.current = false;
      } else {
        setConnected(connected);
        if (connected && !lastConnectedRef.current) {
          lastConnectedRef.current = true;
          fetchHistoricalData();
        }
        if (!connected) lastConnectedRef.current = false;
      }
    });

    const unsub = client.subscribe((msg: WsMessage) => {
      touch();

      if (msg.type === 'response') {
        const resp = msg.data as Record<string, unknown>;

        if (resp?.data && typeof resp.data === 'object') {
          const innerData = resp.data;

          if (!Array.isArray(innerData)) {
            const obj = innerData as Record<string, unknown>;
            if ('trades' in obj && 'total' in obj) {
              const p = obj as unknown as PaginatedTrades;
              setTradePage(p);
              addTradeFromDb(p.trades);
              return;
            }
            if ('today' in obj && 'thisHour' in obj) {
              setTodayStats(obj as unknown as TodayStats);
              return;
            }
            if ('total' in obj && 'resolved' in obj && 'wins' in obj) {
              setSignalStats(obj as unknown as import('@/types').SignalStats);
              return;
            }
          }

          if (Array.isArray(innerData)) {
            const arr = innerData as Record<string, unknown>[];
            if (arr.length > 0) {
              if ('localId' in arr[0] || 'contractId' in arr[0]) {
                addTradeFromDb(arr as unknown as import('@/types').Trade[]);
                return;
              }
              if ('score' in arr[0] && 'price' in arr[0]) {
                setSignals(arr as unknown as Signal[]);
                return;
              }
            }
            return;
          }
        }

        if (Array.isArray(msg.data)) {
          const arr = msg.data as Record<string, unknown>[];
          if (arr.length > 0 && ('localId' in arr[0] || 'contractId' in arr[0])) {
            addTradeFromDb(arr as unknown as import('@/types').Trade[]);
          }
          return;
        }

        return;
      }

      switch (msg.type) {
        case 'todayStats':
          setTodayStats(msg.data as TodayStats);
          break;
        case 'status':
          updateStatus(msg.data as BotStatus);
          const status = msg.data as BotStatus;
          if (status.state === 'AUTHORIZED' || status.state === 'COLLECTING' || status.state === 'SCORING') {
            if (!isInitialLoad) {
              if (fetchTimerRef.current) clearTimeout(fetchTimerRef.current);
              fetchTimerRef.current = setTimeout(fetchHistoricalData, 500);
            }
          }
          if (status.activeContracts > 0 && !useBotStore.getState().activeContract) {
            const client = getWsClient();
            client.send('getActiveContracts');
          }
          break;
        case 'tick':
          addTick(msg.data as Tick);
          break;
        case 'ticks':
          addTicks(msg.data as Tick[]);
          break;
        case 'indicators': {
          const ind = msg.data as Indicators;
          updateIndicators(ind);
          break;
        }
        case 'config':
          setConfig(msg.data as BotConfig);
          break;
        case 'tradeExecuted': {
          const exec = msg.data as TradeExecutedEvent;
          if (exec.success && exec.direction) {
            const cfg = useBotStore.getState().config;
            setActiveContract({
              localId: exec.localId || '',
              contractId: exec.contractId,
              direction: exec.direction as 'CALL' | 'PUT',
              entryPrice: exec.entryPrice || 0,
              entryTick: 0,
              expiryTick: 0,
              stake: exec.stake,
              contractType: exec.contractType || cfg?.contractType || '',
              multiplier: cfg?.multiplier,
              stopLoss: cfg?.stopLoss,
              takeProfit: cfg?.takeProfit,
              entryEpoch: exec.entryEpoch,
            });
          }
          client.send('getTodayStats');
          break;
        }
        case 'tradeResolved': {
          const resolved = msg.data as TradeResolvedEvent;
          const cfg = useBotStore.getState().config;
          if (cfg) addTradeResolved(resolved, cfg);
          client.send('getTodayStats');
          client.send('getAllTrades', { page: 1, limit: 200 });
          break;
        }
        case 'activeContracts': {
          const contracts = msg.data as import('@/types').ActiveContractData[];
          if (contracts && contracts.length > 0) {
            const first = contracts[0];
            setActiveContract({
              localId: first.localId || '',
              contractId: first.contractId,
              direction: first.direction,
              entryPrice: first.entryPrice,
              entryTick: first.entryTick,
              expiryTick: first.expiryTick,
              stake: first.stake,
              contractType: first.contractType,
              multiplier: first.multiplier,
              stopLoss: first.stopLoss,
              takeProfit: first.takeProfit,
              entryEpoch: first.entryEpoch,
            });
          } else {
            setActiveContract(null);
          }
          break;
        }
        case 'contractUpdate': {
          updateActiveContractPnl(msg.data as ContractUpdate);
          break;
        }
        case 'signal': {
          const sig = msg.data as Signal;
          addSignal(sig);
          setScore({
            total: sig.score,
            threshold: 0,
            direction: sig.direction as 'CALL' | 'PUT' | null,
            decision: sig.score >= 1 ? 'ENTER' : 'SKIP',
            components: {
              rsi: sig.scoreRsi,
              bb: sig.scoreBb,
              ema: sig.scoreEma,
              roc: sig.scoreRoc,
              momentum: sig.scoreMomentum,
              postSpike: sig.scoreSpikePenalty,
            },
          });
          break;
        }
      }
    });

    client.connect();

    return () => {
      unsub();
      if (fetchTimerRef.current) clearTimeout(fetchTimerRef.current);
    };
  }, []);
}
