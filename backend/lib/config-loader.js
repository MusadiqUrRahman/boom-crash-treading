const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const rawConfig = require('../config');

function validate(config) {
  const errors = [];
  if (!config.apiToken) errors.push('DERIV_API_TOKEN is required — set it in .env or config.js');
  if (!config.appId || isNaN(config.appId)) errors.push('DERIV_APP_ID must be a number');
  if (!config.symbols || config.symbols.length === 0) errors.push('At least one symbol required in TARGET_SYMBOLS');
  if (config.minTicksPerSymbol < 50000) errors.push('MIN_TICKS_PER_SYMBOL must be at least 50000');
  if (errors.length > 0) throw new Error('Config validation failed:\n  ' + errors.join('\n  '));
  return config;
}

module.exports = { loadConfig: () => validate(rawConfig) };
