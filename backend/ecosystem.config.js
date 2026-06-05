module.exports = {
  apps: [{
    name: 'boom-crash-bot',
    script: 'index.js',
    cwd: __dirname,
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    autorestart: true,
    max_restarts: 10,
    restart_delay: 5000,
    max_memory_restart: '200M',
    env: {
      NODE_ENV: 'production',
      PM2_GRACEFUL_TIMEOUT: 15000,
    },
    log_file: './logs/pm2-combined.log',
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    merge_logs: true,
    time: true,
  }],
};
