# 🚀 Deployment Guide — Glo Agent v3

Bot Telegram butuh proses yang jalan **24/7**. Berikut platform gratis yang cocok:

---

## ✨ Apa Baru di v3

- 🖼️ **Vision** — kirim foto/file gambar, auto-analisa AI (Groq llama-4-scout)
- 🎤 **Voice ASR** — kirim voice note, auto-transcribe via Groq Whisper, lalu proses AI
- 🔊 **TTS** — `/tts <teks>` untuk text-to-speech (perlu Z.ai infra)
- 🌐 **Web Search** — `/search <query>` atau "cari ...", pakai DuckDuckGo (gratis, no key)
- 🧠 **Long-term Memory** — bot inget preferensi & facts user antar session
- ⚡ **Streaming Response** — premium user lihat AI "ngetik" real-time
- 🧭 **Multi-model Routing** — query simple → fast model, complex → primary model
- 💎 **Premium Tier** — gating free vs unlimited (via `PREMIUM_USER_IDS`)
- 🔍 **Inline Mode** — `@bot query` dari chat mana saja

---

## ⚡ Option 1: Railway (RECOMMENDED — Paling Gampang)

Railway itu gratis $5 credit/bulan, cukup buat 1 bot.

### Steps:
1. Push kode ke GitHub (lihat `deploy-github.sh`)
2. Buka https://railway.app → **Login with GitHub**
3. Klik **New Project** → **Deploy from GitHub repo**
4. Pilih repo `telegram-ai-agent`
5. Masuk **Variables** tab → Add:
   - `BOT_TOKEN` = `<your-bot-token>` (from @BotFather)
   - `AI_PROVIDER` = `groq` (recommended, free)
   - `AI_API_KEY` = `gsk_xxx` (from https://console.groq.com/keys)
   - `AI_MODEL` = `llama-3.3-70b-versatile` (default, optional)
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

---

## 📚 Environment Variables Reference (v3)

### Wajib
| Variable | Description | Example |
|----------|-------------|---------|
| `BOT_TOKEN` | Token dari @BotFather | `8990451027:AAHxxx...` |
| `AI_PROVIDER` | Provider AI | `groq` |
| `AI_API_KEY` | API key provider | `gsk_xxx...` |

### Opsional — Override model
| Variable | Default | Description |
|----------|---------|-------------|
| `AI_MODEL` | `llama-3.3-70b-versatile` | Primary model |
| `AI_VISION_MODEL` | `meta-llama/llama-4-scout-17b-16e-instruct` | Model untuk vision |
| `AI_FAST_MODEL` | `llama-3.1-8b-instant` | Model untuk query simple |
| `AI_BASE_URL` | (per preset) | Override base URL |

### Opsional — Premium & Tiers
| Variable | Default | Description |
|----------|---------|-------------|
| `PREMIUM_USER_IDS` | (kosong) | Comma-separated Telegram user IDs dengan akses premium |
| `ADMIN_USERS` | (kosong) | Comma-separated admin IDs (auto-premium) |

### Opsional — Search providers (default: DuckDuckGo, no key)
| Variable | Description |
|----------|-------------|
| `TAVILY_API_KEY` | Jika set, pakai Tavily (1000 req/month free) |
| `SERPER_API_KEY` | Jika set, pakai Serper.dev (2500 req free trial) |

### Opsional — Tuning
| Variable | Default | Description |
|----------|---------|-------------|
| `MAX_TOKENS` | `4096` | Max tokens per response |
| `TEMPERATURE` | `0.7` | Default temperature |
| `MAX_HISTORY` | `20` | Max messages in conversation history |
| `HISTORY_TTL` | `3600` | History TTL in seconds (1 hour) |
| `RATE_LIMIT` | `10` | Max requests per minute per user |
| `COOLDOWN` | `5` | Cooldown seconds between requests |
| `MEMORY_DIR` | `./data` | Directory for memory & usage data |

---

## 💎 Cara Setup Premium

1. Cari Telegram user ID kamu (bisa via @userinfobot)
2. Tambah env var di Railway:
   ```
   PREMIUM_USER_IDS=123456789,987654321
   ```
3. Save → Railway auto-redeploy
4. User tersebut langsung dapat:
   - Unlimited messages, vision, search, voice
   - Streaming response aktif
   - TTS enabled
   - Primary model (llama-3.3-70b) untuk semua query
