# Deployment Guide — Free 24/7 Hosting (No Credit Card)

## Option 1: HidenCloud (Recommended — No Card)

### Why HidenCloud?
- 3GB RAM, 2GB disk, 2 CPU cores — FREE
- Node.js support, WebSocket support
- 24/7 uptime, no sleep
- No credit card required
- Weekly renewal (free from dashboard)

### Steps:

1. **Go to** https://www.hidencloud.com/service/free-node-hosting
2. **Create Account** — Sign up with email
3. **Create Server:**
   - Select: NodeJS
   - Region: Choose closest to you
   - Click "Build my free server"
4. **Get SSH credentials** from dashboard after server is ready
5. **Connect:**
   ```bash
   ssh root@<SERVER_IP> -p <PORT>
   ```
6. **Install Node.js:**
   ```bash
   apt update && apt upgrade -y
   curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
   apt install -y nodejs build-essential
   npm install -g pm2
   ```
7. **Upload your code:**
   ```bash
   # From your laptop, in the project folder:
   scp -r -P <PORT> backend root@<SERVER_IP>:/root/
   ```
8. **Setup on server:**
   ```bash
   cd /root/backend
   npm install
   mkdir -p logs data reports/daily
   nano .env   # paste your config
   pm2 start index.js --name trading-bot
   pm2 save
   pm2 startup   # run the output command
   ```

---

## Option 2: GratisVPS (No Card)

### Why GratisVPS?
- Free VPS, not container — full Linux
- 24/7 uptime, no sleep
- KVM virtualization
- Node.js support
- No credit card

### Steps:

1. **Go to** https://gratisvps.net/free-vps-server-discord.html
2. **Create Account** — Sign up (Discord may be required)
3. **Request Free VPS** — Fill form, wait for approval
4. **Get SSH credentials** from email/dashboard
5. **Follow same steps as HidenCloud** (install Node.js, PM2, etc.)

---

## Option 3: VaultScope (No Card)

### Steps:

1. **Go to** https://vaultscope.dev/services/coding
2. **Create Account**
3. **Deploy Node.js Container**
4. **Follow setup steps**

---

## Option 4: Your Old Phone (Best for Pakistan — No Card, No Server)

### Why Phone is BEST for your situation?
- **$0 cost** — truly free, forever
- **No credit card** — nothing needed
- **Battery backup** — works during power cuts
- **Mobile data** — works during internet outages (if you have cellular)
- **Always on** — no sleep, no shutdown
- **Full control** — install anything

### What you need:
- Old Android phone (any phone with Android 7+)
- Charger (keep it plugged in 24/7)
- SIM with data plan (Jazz/Telenor/Zong — cheapest data)

### Steps:

1. **Install Termux** from F-Droid (NOT Play Store — Play Store version is outdated):
   - Download F-Droid from: https://f-droid.org/packages/com.termux/
   - Open F-Droid → Search "Termux" → Install

2. **Open Termux and run:**
   ```bash
   # Update packages
   pkg update && pkg upgrade -y

   # Install Node.js
   pkg install -y nodejs-lts git

   # Install build tools (for better-sqlite3)
   pkg install -y build-essential python

   # Install PM2
   npm install -g pm2
   ```

3. **Clone your repo:**
   ```bash
   cd ~
   git clone https://github.com/MusadiqUrRahman/boom-crash-treading.git
   cd boom-crash-treading/backend
   npm install
   mkdir -p logs data reports/daily
   ```

4. **Create .env file:**
   ```bash
   nano .env
   ```
   Paste your config, save with Ctrl+O → Enter → Ctrl+X

5. **Test run:**
   ```bash
   node index.js
   ```
   Watch for "Authorized" message. Press Ctrl+C to stop.

6. **Start with PM2 (24/7):**
   ```bash
   pm2 start index.js --name trading-bot
   pm2 save
   pm2 startup
   ```
   Run the output command if it shows one.

7. **Keep Termux running:**
   - **DO NOT swipe Termux away from recent apps**
   - Termux stays running in background
   - Phone screen can be off
   - Keep charger plugged in 24/7

8. **Check logs anytime:**
   ```bash
   pm2 logs trading-bot
   ```

9. **If Termux gets killed (phone restart):**
   ```bash
   cd ~/boom-crash-treading/backend
   pm2 resurrect
   ```

### Phone Tips:
- Disable battery optimization for Termux (Settings → Apps → Termux → Battery → Unrestricted)
- Disable auto-update for Termux
- Keep phone in a cool place (heat damages battery)
- Use a cheap data SIM (Jazz 4G — Rs. 50/week for 2GB)

---

## Comparison

| Option | Cost | Card Needed | 24/7 | Sleep | Difficulty |
|--------|------|-------------|------|-------|------------|
| Oracle Cloud | $0 | Yes | Yes | No | Medium |
| HidenCloud | $0 | No | Yes | No | Easy |
| GratisVPS | $0 | No | Yes | No | Easy |
| VaultScope | $0 | No | Yes | No | Easy |
| Old Phone | $0 | No | Yes | No | Easy |

---

## My Recommendation

**For your situation (Pakistan, no card, unreliable power/internet):**

**Use your old phone with Termux.** It's the most reliable because:
- Works during power cuts (battery)
- Works during internet outages (mobile data)
- No card needed
- No server to configure
- $0 forever
- You control everything

If you don't have an old phone → **HidenCloud** (free, no card, 24/7).
