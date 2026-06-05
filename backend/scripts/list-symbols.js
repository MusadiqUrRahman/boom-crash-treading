const { loadConfig } = require('../lib/config-loader');
const DerivClient = require('../lib/deriv-client');

async function main() {
  const config = loadConfig();

  const client = new DerivClient(config);
  await client.connect();

  const response = await client.getActiveSymbols();

  const allSymbols = response.active_symbols || [];
  const syntheticIndices = allSymbols.filter(s => s.market === 'synthetic_index');
  const foundTargets = [];
  const missingTargets = [];

  console.log('\nDeriv Symbol Discovery Results');
  console.log('────────────────────────────────────────────────────────────────');
  console.log('  Symbol'.padEnd(18) + 'Display Name'.padEnd(35) + 'Submarket');
  console.log('────────────────────────────────────────────────────────────────');

  for (const s of syntheticIndices) {
    const isTarget = config.symbols.includes(s.symbol);
    const marker = isTarget ? '  ← TARGET' : '';
    console.log(
      `  ${s.symbol.padEnd(16)} ${s.display_name.padEnd(33)} ${s.submarket || ''}${marker}`
    );
    if (isTarget) foundTargets.push(s.symbol);
  }

  for (const target of config.symbols) {
    if (!foundTargets.includes(target)) {
      missingTargets.push(target);
    }
  }

  if (syntheticIndices.length === 0) {
    console.log('  (no synthetic indices found)');
  }

  console.log('────────────────────────────────────────────────────────────────');
  console.log(`\nSummary:`);
  console.log(`  Synthetic indices found: ${syntheticIndices.length}`);

  for (const target of config.symbols) {
    if (foundTargets.includes(target)) {
      const info = syntheticIndices.find(s => s.symbol === target);
      console.log(`  \u2713 ${target} confirmed: ${info.display_name}`);
    } else {
      console.log(`  \u2717 ${target} NOT FOUND in active symbols`);
    }
  }

  await client.disconnect();
}

main().catch(err => {
  console.error('Symbol discovery failed:', err.message);
  process.exit(1);
});
