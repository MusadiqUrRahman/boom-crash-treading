# Production Deployment Guide

## Prerequisites

- Node.js 18+
- npm dependencies installed (`npm install`)
- pm2 installed globally (`npm install -g pm2`)
- Derived API token for demo account
- `.env` configured (copy from `.env.example`)

## Deployment Steps

### 1. Install Dependencies

```bash
cd backend
npm install
npm install -g pm2
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your API_TOKEN and other settings
```

### 3. Verify Demo Account

```bash
# Test connection and dry-run mode
npm run live-dry
# Verify logs show "AUTHORIZED" state
# Ctrl+C to stop
```

### 4. Start with pm2

```bash
pm2 start ecosystem.config.js
pm2 status
pm2 logs boom-crash-bot --lines 50
```

### 5. Configure Auto-Start

```bash
pm2 save
pm2 startup
# Follow the on-screen instructions
```

### 6. Verify Health Check

```bash
curl http://127.0.0.1:3456/health
# Should return JSON with bot status
```

## Graduation Plan (Demo -> Real Money)

### Week 1: Demo, No Buys
- `DRY_RUN=true`
- Verify: scoring, logging, health check, alerts
- 7 days minimum

### Week 2-3: Demo, Live Buys
- `DRY_RUN=false`
- `API_TOKEN=<demo_account_token>`
- Verify: trade execution, contract monitoring, risk limits
- 500+ trades minimum

### Week 4+: Real Account, Minimum Stake
- `DRY_RUN=false`
- `API_TOKEN=<real_account_token>`
- Start at $0.35 stake
- 50 trades at $0.35
- If WR >= 54% -> increase to $0.50
- If WR < 50% -> STOP and review

### Gradual Scaling
- Every 100 trades, recalculate WR
- If WR >= target -> increase stake by 50% (max $2.00)
- If WR < breakeven -> reduce stake or stop

## Real Account Safeguards

| Limit | Value | Action |
|-------|-------|--------|
| Daily loss | 10% of account | HARD STOP |
| Max drawdown from peak | 15% | HARD STOP |
| Consecutive losses >= 3 | Reduce stake by 50% | Auto |
| Consecutive losses >= 5 | STOP for the day | HARD STOP |
| Max trades per day | 100 | HARD STOP |

## Monitoring

### Health Check
```bash
curl http://127.0.0.1:3456/health
```

### pm2 Commands
```bash
pm2 status                    # Process status
pm2 logs boom-crash-bot       # Live logs
pm2 monit                     # Resource monitor
pm2 stop boom-crash-bot       # Graceful stop
pm2 restart boom-crash-bot    # Restart
pm2 reload boom-crash-bot     # Zero-downtime reload
```

### Manual Stop
```bash
# Create stop.txt in backend/ directory
echo "stop" > backend/stop.txt
# Bot detects the file and shuts down gracefully within 10 seconds
```

### Log Files
```
backend/logs/
  combined-YYYY-MM-DD.log     # All logs
  error-YYYY-MM-DD.log        # Error logs
  pm2-combined.log            # pm2 process logs
```

### Daily Reports
```
backend/reports/daily/
  YYYY-MM-DD-summary.json     # Machine-readable
  YYYY-MM-DD-summary.txt      # Human-readable
```

## Upgrade Process

```bash
cd backend
git pull
npm install
pm2 restart boom-crash-bot
pm2 logs boom-crash-bot --lines 20
```

## Troubleshooting

| Symptom | Check | Solution |
|---------|-------|----------|
| Bot won't connect | API_TOKEN in .env | Set correct token |
| WebSocket errors | Network/firewall | Ensure outbound to wss://ws.derivws.com:443 |
| Health check fails | Port 3456 in use | Change HEALTH_PORT in .env |
| High memory usage | Memory leak | pm2 restart (max_memory_restart: 200M auto-restarts) |
| Logs not rotating | Disk space | Check logs/archive/ — old logs are gzipped |
| Telegram alerts not sending | TELEGRAM_BOT_TOKEN | Verify token and chat ID |
