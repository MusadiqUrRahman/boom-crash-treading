import type { Trade, Signal } from '@/types';

function downloadBlob(content: string, filename: string, mime = 'text/csv') {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportTradesToCsv(trades: Trade[], filename = 'trades.csv') {
  const headers = [
    'Local ID', 'Contract ID', 'Symbol', 'Direction', 'Stake', 'Entry Price', 'Exit Price',
    'Entry Time', 'Exit Time', 'Duration (ticks)', 'Score', 'Win', 'PnL', 'Balance After',
    'Exit Reason', 'Contract Type', 'Dry Run', 'Created At',
  ];
  const rows = trades.map(t => [
    t.localId, t.contractId || '', t.symbol, t.direction, t.stake,
    t.entryPrice, t.exitPrice,
    t.entryEpoch ? new Date(t.entryEpoch * 1000).toISOString() : '',
    t.exitEpoch ? new Date(t.exitEpoch * 1000).toISOString() : '',
    t.durationTicks, t.score ?? '', t.win ? 'Yes' : 'No', t.pnl ?? '',
    t.balanceAfter ?? '', t.exitReason || '', t.contractType || '',
    t.dryRun ? 'Yes' : 'No', t.createdAt,
  ]);

  const csv = [
    headers.join(','),
    ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')),
  ].join('\n');

  downloadBlob(csv, filename);
}

export function exportSignalsToCsv(signals: Signal[], filename = 'signals.csv') {
  const headers = [
    'ID', 'Timestamp', 'Epoch', 'Price', 'Direction', 'Score',
    'RSI', 'BB', 'EMA', 'ROC', 'Momentum', 'Spike Penalty',
    'Contract Type', 'Resolved', 'Outcome', 'PnL',
  ];
  const rows = signals.map(s => [
    s.id, s.timestamp, s.epoch, s.price, s.direction, s.score,
    s.scoreRsi, s.scoreBb, s.scoreEma, s.scoreRoc, s.scoreMomentum, s.scoreSpikePenalty,
    s.contractType || '', s.resolved ? 'Yes' : 'No', s.outcome || '', s.pnl ?? '',
  ]);

  const csv = [
    headers.join(','),
    ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')),
  ].join('\n');

  downloadBlob(csv, filename);
}

export function exportMetricsSnapshot(trades: Trade[]) {
  if (trades.length === 0) return;
  const wins = trades.filter(t => t.win);
  const losses = trades.filter(t => !t.win);
  const totalPnL = trades.reduce((s, t) => s + (t.pnl || 0), 0);
  const winRate = (wins.length / trades.length * 100).toFixed(1);
  const avgWin = wins.length > 0 ? (wins.reduce((s, t) => s + (t.pnl || 0), 0) / wins.length).toFixed(2) : '0';
  const avgLoss = losses.length > 0 ? (Math.abs(losses.reduce((s, t) => s + (t.pnl || 0), 0)) / losses.length).toFixed(2) : '0';
  const grossProfit = wins.reduce((s, t) => s + (t.pnl || 0), 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + (t.pnl || 0), 0));
  const profitFactor = grossLoss > 0 ? (grossProfit / grossLoss).toFixed(2) : grossProfit > 0 ? '∞' : '0';

  const text = [
    '=== Performance Snapshot ===',
    `Generated: ${new Date().toISOString()}`,
    `Total Trades: ${trades.length}`,
    `Wins: ${wins.length} | Losses: ${losses.length}`,
    `Win Rate: ${winRate}%`,
    `Total PnL: ${totalPnL >= 0 ? '+' : ''}$${Math.abs(totalPnL).toFixed(2)}`,
    `Avg Win: $${avgWin} | Avg Loss: $${avgLoss}`,
    `Profit Factor: ${profitFactor}`,
    `---`,
    trades.map(t => `${t.win ? 'W' : 'L'} | $${(t.pnl || 0).toFixed(2)} | ${t.exitReason || 'N/A'} | ${t.direction} | ${t.durationTicks} ticks`).join('\n'),
  ].join('\n');

  downloadBlob(text, 'performance-snapshot.txt', 'text/plain');
}
