# 🚀 Deployment Guide

Bot Telegram butuh proses yang jalan **24/7**. Berikut platform gratis yang cocok:

---

## ⚡ Option 1: Railway (RECOMMENDED — Paling Gampang)

Railway itu gratis $5 credit/bulan, cukup buat 1 bot.

### Steps:
1. Push kode ke GitHub (lihat `deploy-github.sh`)
2. Buka https://railway.app → **Login with GitHub**
3. Klik **New Project** → **Deploy from GitHub repo**
4. Pilih repo `telegram-ai-agent`
5. Masuk **Variables** tab → Add:
   - `BOT_TOKEN` = `8990451027:AAHO7B3R2Kfimw8RtwaoSNJutigjYemknRM`
6. Auto-deploy! ✅

Bot langsung jalan 24/7. Selesai! 🎉

---

## 🟢 Option 2: Render (Gratis)

1. Push ke GitHub
2. Buka https://render.com → **New** → **Web Service**
3. Connect repo GitHub
4. Settings:
   - **Build Command**: `npm install`
   - **Start Command**: `node src/index.js`
   - **Environment**: Add `BOT_TOKEN`
5. Deploy! ✅

⚠️ Note: Free tier sleep setelah 15 menit idle. Bot akan "bangun" saat ada pesan baru (ada delay ~30 detik pertama kali).

---

## 🔵 Option 3: Fly.io (Gratis)

```bash
# Install fly CLI
curl -L https://fly.io/install.sh | sh

# Login
fly auth login

# Launch
fly launch --no-deploy

# Set secret
fly secrets set BOT_TOKEN=8990451027:AAHO7B3R2Kfimw8RtwaoSNJutigjYemknRM

# Deploy
fly deploy
```

---

## 🐳 Option 4: VPS (DigitalOcean, Vultr, dll)

```bash
# SSH ke server
ssh user@your-server

# Clone repo
git clone https://github.com/YOUR_USERNAME/telegram-ai-agent.git
cd telegram-ai-agent

# Install dependencies
npm install

# Set token
export BOT_TOKEN=8990451027:AAHO7B3R2Kfimw8RtwaoSNJutigjYemknRM

# Jalankan dengan PM2 (auto-restart, logs, dll)
npm i -g pm2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup  # Auto-start saat server reboot
```

---

## 🔴 Kenapa BUKAN Vercel?

Vercel itu untuk **web apps & serverless functions**, bukan untuk bot yang butuh:
- **Long polling** — koneksi persistent ke Telegram API
- **State/memory** — menyimpan riwayat percakapan
- **24/7 uptime** — Vercel serverless functions auto-sleep

Kalau mau pakai Vercel, harus rewrite jadi webhook mode + external database (Redis/PostgreSQL). Jauh lebih ribet.

---

## 📊 Perbandingan Platform

| Platform | Gratis? | Uptime | Cocok Untuk Bot? | Difficulty |
|----------|---------|--------|-------------------|------------|
| **Railway** | ✅ $5/mo | 24/7 | ✅✅✅ Best | ⭐ Easy |
| **Render** | ✅ Free | Sleep idle | ⚠️ OK | ⭐ Easy |
| **Fly.io** | ✅ Free | 24/7 | ✅✅ Good | ⭐⭐ Medium |
| **VPS** | 💰 $4/mo | 24/7 | ✅✅✅ Best | ⭐⭐⭐ Hard |
| **Vercel** | ✅ Free | Sleep | ❌ Not ideal | ⭐⭐⭐ Hard |

---

## 🔐 Security Tips

- ❌ **JANGAN** hardcode BOT_TOKEN di kode
- ✅ Selalu pakai environment variable
- ✅ Tambah `BOT_TOKEN` di GitHub Secrets (bukan di kode)
- ✅ `.env` sudah ada di `.gitignore`
