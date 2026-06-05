const http = require('http');

class HealthMonitor {
  constructor(bot, logger, port) {
    this.bot = bot;
    this.logger = logger;
    this.port = port || 3456;
    this.server = null;
  }

  start() {
    this.server = http.createServer((req, res) => {
      if (req.url === '/health' || req.url === '/health/') {
        try {
          const health = this.bot.getHealth();
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(health, null, 2));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'error', error: err.message }));
        }
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    this.server.listen(this.port, '127.0.0.1', () => {
      this.logger.info('HealthMonitor', `Health check at http://127.0.0.1:${this.port}/health`);
    });

    this.server.on('error', (err) => {
      this.logger.error('HealthMonitor', `Failed to start health server: ${err.message}`);
    });
  }

  stop() {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}

module.exports = HealthMonitor;
