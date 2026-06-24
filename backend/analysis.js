const Database = require('better-sqlite3');
const db = new Database('data/live_trades.db');

const TARGET = '2026-06-21';

const trades = db.prepare(`
  SELECT local_id, created_at, direction, stake, entry_price, exit_price, 
         pnl, win, exit_reason, duration_ticks, score
  FROM trades 
  WHERE created_at LIKE '${TARGET}%'
  ORDER BY id ASC
`).all();

console.log('=== RAW DATA FOR ANALYSIS ===\n');

// Group by direction
const calls = trades.filter(t => t.direction === 'CALL');
const puts = trades.filter(t => t.direction === 'PUT');

console.log('=== CALL TRADES (all 69) ===');
calls.forEach((t, i) => {
  console.log(`#${i+1} ${t.created_at.slice(11)} | Entry: ${t.entry_price?.toFixed(4)} | Exit: ${t.exit_price?.toFixed(6)} | PnL: ${t.pnl >= 0 ? '+' : ''}${t.pnl?.toFixed(4)} | ${t.win ? 'WIN' : 'LOSS'} | ${t.exit_reason} | ${t.duration_ticks}t`);
});

console.log('\n=== PUT TRADES (all 19) ===');
puts.forEach((t, i) => {
  console.log(`#${i+1} ${t.created_at.slice(11)} | Entry: ${t.entry_price?.toFixed(4)} | Exit: ${t.exit_price?.toFixed(6)} | PnL: ${t.pnl >= 0 ? '+' : ''}${t.pnl?.toFixed(4)} | ${t.win ? 'WIN' : 'LOSS'} | ${t.exit_reason} | ${t.duration_ticks}t`);
});

console.log('\n=== KEY METRICS ===');
console.log('CALL:');
console.log(`  Total trades: ${calls.length}`);
console.log(`  Wins: ${calls.filter(t=>t.win).length}, Losses: ${calls.filter(t=>!t.win).length}`);
console.log(`  Total PnL: $${calls.reduce((s,t)=>s+t.pnl,0).toFixed(4)}`);
console.log(`  Avg Win: $${(calls.filter(t=>t.win).reduce((s,t)=>s+t.pnl,0) / Math.max(1,calls.filter(t=>t.win).length)).toFixed(4)}`);
console.log(`  Avg Loss: $${(calls.filter(t=>!t.win).reduce((s,t)=>s+t.pnl,0) / Math.max(1,calls.filter(t=>!t.win).length)).toFixed(4)}`);
console.log(`  Win/Loss PnL ratio: ${Math.abs((calls.filter(t=>t.win).reduce((s,t)=>s+t.pnl,0) / Math.max(1,calls.filter(t=>!t.win).reduce((s,t)=>s+t.pnl,0)))).toFixed(2)}`);

console.log('PUT:');
console.log(`  Total trades: ${puts.length}`);
console.log(`  Wins: ${puts.filter(t=>t.win).length}, Losses: ${puts.filter(t=>!t.win).length}`);
console.log(`  Total PnL: $${puts.reduce((s,t)=>s+t.pnl,0).toFixed(4)}`);
console.log(`  Avg Win: $${(puts.filter(t=>t.win).reduce((s,t)=>s+t.pnl,0) / Math.max(1,puts.filter(t=>t.win).length)).toFixed(4)}`);
console.log(`  Avg Loss: $${(puts.filter(t=>!t.win).reduce((s,t)=>s+t.pnl,0) / Math.max(1,puts.filter(t=>!t.win).length)).toFixed(4)}`);
console.log(`  Win/Loss PnL ratio: ${Math.abs((puts.filter(t=>t.win).reduce((s,t)=>s+t.pnl,0) / Math.max(1,calls.filter(t=>!t.win).reduce((s,t)=>s+t.pnl,0)))).toFixed(2)}`);

console.log('\n=== PUT EXIT PRICES (detailed) ===');
puts.forEach(t => {
  const pnlSign = t.pnl >= 0 ? '+' : '';
  console.log(`${t.win ? 'WIN' : 'LOSS'} | Entry: ${t.entry_price?.toFixed(6)} | Exit: ${t.exit_price?.toFixed(6)} | PnL: ${pnlSign}${t.pnl?.toFixed(4)} | ${t.exit_reason}`);
});

console.log('\n=== ALREADY_SOLD TRADES ===');
const alreadySold = trades.filter(t => t.exit_reason === 'ALREADY_SOLD');
alreadySold.forEach(t => {
  console.log(`${t.direction} | ${t.created_at} | Entry: ${t.entry_price?.toFixed(4)} | Exit: ${t.exit_price?.toFixed(6)} | PnL: ${t.pnl >= 0 ? '+' : ''}${t.pnl?.toFixed(4)}`);
});

console.log('\n=== EXIT PRICE ANALYSIS (PUT wins) ===');
const putWins = puts.filter(t => t.win);
putWins.forEach(t => {
  const diff = t.exit_price - t.entry_price;
  const pct = ((t.exit_price - t.entry_price) / t.entry_price) * 100;
  console.log(`Entry: ${t.entry_price?.toFixed(6)} Exit: ${t.exit_price?.toFixed(6)} Diff: ${diff >= 0 ? '+' : ''}${diff.toFixed(6)} (${pct >= 0 ? '+' : ''}${pct.toFixed(4)}%) Stake: $${t.stake} PnL: ${t.pnl >= 0 ? '+' : ''}${t.pnl?.toFixed(4)}`);
});
