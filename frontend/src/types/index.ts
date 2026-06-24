export type BotState =
  | 'INIT' | 'DISCONNECTED' | 'CONNECTING' | 'AUTHORIZING'
  | 'AUTHORIZED' | 'COLLECTING' | 'SCORING' | 'DECISION' | 'SKIP'
  | 'ENTERING' | 'IN_POSITION' | 'RESOLVING' | 'COOLDOWN' | 'STOPPING'
  | 'STOPPED' | 'ERROR';

export type ConnectionState =
  | 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'AUTHORIZED' | 'ERROR';

export interface Tick {
  epoch: number;
  quote: number;
}

export interface ScoreComponents {
  rsi: number;
  bb: number;
  ema: number;
  roc: number;
  momentum: number;
  postSpike: number;
}

export interface RsiResult {
  value: number;
  isOversold: boolean;
  isOverbought: boolean;
}

export interface BollingerBands {
  upper: number;
  middle: number;
  lower: number;
  belowLower: boolean;
  aboveUpper: boolean;
}

export interface Indicators {
  rsi: RsiResult | null;
  bb: BollingerBands | null;
  emaShort: number | null;
  emaLong: number | null;
  roc: number | null;
}

export interface RiskStatus {
  balance: number;
  dailyTrades: number;
  dailyPnL: number;
  dailyWins: number;
  dailyLoss: number;
  consecutiveLosses: number;
  drawdown: number;
  drawdownPct: string;
  winRate: string;
}

export interface SessionStatus {
  sessionDuration: number;
  trades: number;
  wins: number;
  losses: number;
  winRate: string;
  totalPnL: number;
  avgPnL: number;
  profitFactor: string;
  maxDrawdown: string;
  consecutiveWins: number;
  consecutiveLosses: number;
  totalStake: string;
}

export interface BotStatus {
  state: BotState;
  tickIndex: number;
  connectionState: ConnectionState;
  bufferSize: number;
  indicatorsReady: boolean;
  activeContracts: number;
  risk: RiskStatus;
  session: SessionStatus;
}

export interface Trade {
  _key: string;
  localId: string;
  contractId: string | null;
  symbol: string;
  direction: 'CALL' | 'PUT';
  stake: number;
  payoutRate: number | null;
  entryPrice: number;
  exitPrice: number;
  entryEpoch: number;
  exitEpoch: number;
  durationTicks: number;
  score: number | null;
  scoreComponents: ScoreComponents | null;
  win: boolean;
  pnl: number;
  balanceAfter: number | null;
  dryRun: boolean;
  createdAt: string;
  contractType?: string;
  exitReason?: string;
}

export interface ActiveContract {
  localId: string;
  contractId: string | null;
  direction: 'CALL' | 'PUT';
  entryPrice: number;
  entryTick: number;
  expiryTick: number;
  stake: number;
  contractType?: string;
  multiplier?: number;
  stopLoss?: number;
  takeProfit?: number;
  entryEpoch?: number;
}

export interface TradeExecutedEvent {
  success: boolean;
  contractId: string | null;
  localId?: string;
  direction: string;
  stake: number;
  entryPrice: number | null;
  dryRun: boolean;
  transactionId?: string;
  contractType?: string;
  entryEpoch?: number;
}

export interface TradeResolvedEvent {
  localId: string;
  contractId: string | null;
  direction: 'CALL' | 'PUT';
  win: boolean;
  pnl: number;
  entryPrice: number;
  exitPrice: number;
  stake: number;
  payout: number;
  score: number | null;
  scoreComponents: ScoreComponents | null;
  durationTicks: number;
  contractType?: string;
  exitReason?: string;
  entryEpoch?: number;
  exitEpoch?: number;
}

export interface BotConfig {
  symbol: string;
  direction: string;
  dryRun: boolean;
  payoutRate: number;
  stake: number;
  durationTicks: number;
  scoreThreshold: number;
  minScoreSpread: number;
  cooldownTicks: number;
  lossCooldownMultiplier: number;
  rsiPeriod: number;
  rsiOversold: number;
  rsiOverbought: number;
  bbPeriod: number;
  bbStdDev: number;
  emaShortPeriod: number;
  emaLongPeriod: number;
  rocPeriod: number;
  spikeThreshold: number;
  maxConsecutiveLosses: number;
  maxDailyLoss: number;
  maxDailyTrades: number;
  startingBalance: number;
  stakeMode: string;
  baseStake: number;
  minStake: number;
  maxStake: number;
  useMartingale: boolean;
  maxDailyDrawdown: number;
  contractType?: string;
  multiplier?: number;
  stopLoss?: number;
  takeProfit?: number;
  maxMlDurationTicks?: number;
}

export interface DailyReport {
  date: string;
  symbol: string;
  direction: string;
  parameters: Record<string, unknown>;
  account: {
    startBalance: number;
    endBalance: number;
    dailyReturn: number;
    totalPnL: number;
    maxDrawdown: number;
  };
  trades: {
    total: number;
    wins: number;
    losses: number;
    winRate: number;
    avgWin: number;
    avgLoss: number;
    profitFactor: number;
    maxConsecutiveWins: number;
    maxConsecutiveLosses: number;
    averageStake: number;
    totalStake: number;
  };
  timeAnalysis: {
    bestHour: number;
    worstHour: number;
    bestHourWR: number;
    worstHourWR: number;
    tradesByHour: Record<string, number>;
  };
}

export interface BacktestSummary {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  profitFactor: number;
  netProfit: number;
  sharpeRatio: number;
  maxDrawdown: number;
  maxConsecutiveLosses: number;
  avgWin: number;
  avgLoss: number;
}

export interface BacktestTrade {
  tradeId: string;
  entryTick: number;
  entryPrice: number;
  entryTime: number;
  direction: 'CALL' | 'PUT';
  durationTicks: number;
  score: number;
  scoreComponents: ScoreComponents;
  exitTick: number;
  exitPrice: number;
  win: boolean;
  pnl: number;
  cumulativePnl: number;
  accountBalance: number;
}

export interface BacktestResult {
  config: Record<string, unknown>;
  summary: BacktestSummary;
  trades: BacktestTrade[];
}

export interface OptimizationMetrics {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  profitFactor: number;
  netProfit: number;
  sharpeRatio: number;
  maxDrawdown: number;
  maxConsecutiveLosses: number;
  avgWin: number;
  avgLoss: number;
}

export interface ScoreState {
  total: number;
  threshold: number;
  direction: 'CALL' | 'PUT' | null;
  decision: 'ENTER' | 'SKIP' | null;
  components: ScoreComponents | null;
}

export interface Signal {
  id: number;
  timestamp: string;
  epoch: number;
  price: number;
  direction: string;
  score: number;
  scoreRsi: number;
  scoreBb: number;
  scoreEma: number;
  scoreRoc: number;
  scoreMomentum: number;
  scoreSpikePenalty: number;
  indicatorsJson: string | null;
  contractType: string | null;
  contractId: string | null;
  tradeId: number | null;
  resolved: boolean;
  outcome: string | null;
  pnl: number | null;
  createdAt: string;
}

export interface SignalStats {
  total: number;
  resolved: number;
  wins: number;
  losses: number;
  winRate: number;
  avgScore: number;
  pending: number;
}

export type WsMessageType =
  | 'tick' | 'status' | 'tradeExecuted' | 'tradeResolved'
  | 'stateChange' | 'indicators' | 'error' | 'response' | 'config' | 'ticks' | 'signal'
  | 'todayStats' | 'signalStats';

export interface WsMessage {
  type: WsMessageType;
  data: unknown;
  requestId?: string;
}

export interface WsResponseMessage extends WsMessage {
  type: 'response';
  requestId: string;
  data: { data?: unknown; error?: string };
}

export interface WsRequest {
  type: 'request';
  requestId: string;
  action: string;
  params?: Record<string, unknown>;
}

export interface StageMetrics {
  stage: string;
  training?: OptimizationMetrics;
  validation?: OptimizationMetrics;
  test?: OptimizationMetrics;
}

export interface PaginatedTrades {
  trades: Trade[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface HourStats {
  trades: number;
  wins: number;
  losses: number;
  pnl: number;
}

export interface TodayStats {
  today: HourStats;
  thisHour: HourStats;
  hourly: Record<string, HourStats>;
}
