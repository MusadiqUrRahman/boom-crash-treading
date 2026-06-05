const https = require('https');
const http = require('http');

class AlertManager {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.botToken = config.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN || '';
    this.chatId = config.telegramChatId || process.env.TELEGRAM_CHAT_ID || '';
    this.enabled = !!(this.botToken && this.chatId);

    if (!this.enabled) {
      logger.warn('AlertManager', 'Telegram alerts disabled — set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID');
    }
  }

  send(level, component, message, data) {
    const text = this._formatMessage(level, component, message, data);
    this.logger.info('AlertManager', text);

    if (this.enabled) {
      this._sendTelegram(text);
    }
  }

  _formatMessage(level, component, message, data) {
    const emoji = level === 'ERROR' ? '🔴' : level === 'WARN' ? '🟡' : '🟢';
    const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
    let text = `${emoji} [${level}] [${component}] ${message} (${ts})`;
    if (data) {
      text += `\n${JSON.stringify(data, null, 2)}`;
    }
    return text;
  }

  _sendTelegram(text) {
    const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;
    const payload = JSON.stringify({
      chat_id: this.chatId,
      text: text,
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    });

    const options = {
      hostname: 'api.telegram.org',
      path: `/bot${this.botToken}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          this.logger.error('AlertManager', `Telegram API error: ${res.statusCode} ${body}`);
        }
      });
    });

    req.on('error', (err) => {
      this.logger.warn('AlertManager', `Telegram send failed: ${err.message}`);
    });

    req.write(payload);
    req.end();
  }

  alertStopped(reason) {
    this.send('ERROR', 'AlertManager', `Bot STOPPED: ${reason}`);
  }

  alertConsecutiveLosses(count) {
    this.send('WARN', 'AlertManager', `Consecutive losses: ${count}`);
  }

  alertDailyLoss(amount) {
    this.send('ERROR', 'AlertManager', `Daily loss limit: $${amount.toFixed(2)}`);
  }

  alertConnectionLost() {
    this.send('WARN', 'AlertManager', 'Connection lost, reconnecting...');
  }

  alertStarted(config) {
    this.send('INFO', 'AlertManager', `Bot started: ${config.symbol} ${config.direction} stake=$${config.stake.toFixed(2)} mode=${config.dryRun ? 'DRY-RUN' : 'LIVE'}`);
  }

  alertDailyReport(reportPath) {
    this.send('INFO', 'AlertManager', `Daily report generated: ${reportPath}`);
  }
}

module.exports = AlertManager;
