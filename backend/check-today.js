const db = require('better-sqlite3')('./data/live_trades.db');
const row = db.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as wins, ROUND(SUM(pnl),2) as totalPnl FROM trades WHERE DATE(created_at, 'localtime') = DATE('now', 'localtime')").get();
console.log("Today:", JSON.stringify(row));
const cols = db.prepare("PRAGMA table_info(trades)").all();
console.log("Columns:", cols.map(c => c.name).join(', '));
const all = db.prepare("SELECT * FROM trades WHERE DATE(created_at, 'localtime') = DATE('now', 'localtime') ORDER BY id").all();
all.forEach(r => console.log(`  ${r.id} | dir=${r.direction} | pnl=$${r.pnl}`));
db.close();
