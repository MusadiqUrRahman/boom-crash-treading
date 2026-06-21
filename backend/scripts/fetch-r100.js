const DerivClient = require('../lib/deriv-client');
const Database = require('better-sqlite3');
const path = require('path');

async function main() {
  const config = {
    endpoint: 'ws.binaryws.com/',
    appId: 1089,
    apiToken: 'UhAUBv5CBWRI4oe'
  };

  const dbPath = path.resolve('data/boom_crash_ticks.db');
  const db = new Database(dbPath);

  const client = new DerivClient(config);
  await client.connect();
  console.log('Connected');

  let end = 'latest';
  let allRows = [];
  const target = 90000;

  while (allRows.length < target) {
    const data = await client.getTickHistory('R_100', end, 5000);
    const times = data.times;
    const prices = data.prices;

    if (!times || times.length === 0) break;

    for (let i = 0; i < times.length; i++) {
      allRows.push(['R_100', times[i], prices[i]]);
    }
    console.log(`Fetched ${times.length} ticks (${allRows.length}/${target})`);

    end = times[times.length - 1] - 1;
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`Inserting ${allRows.length} rows in bulk...`);
  const insert = db.prepare('INSERT OR IGNORE INTO ticks (symbol, epoch, quote) VALUES (?, ?, ?)');
  const tx = db.transaction((rows) => {
    for (const row of rows) {
      insert.run(...row);
    }
  });
  tx(allRows);
  console.log('Insert complete.');

  const cnt = db.prepare('SELECT COUNT(*) as c FROM ticks WHERE symbol=?').get('R_100');
  console.log(`Total R_100 ticks in DB: ${cnt.c}`);

  db.close();
  console.log('Done.');
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
