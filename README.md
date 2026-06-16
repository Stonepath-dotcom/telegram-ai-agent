# 🤖 Telegram AI Agent Bot

Bot Telegram AI yang pintar dan bisa coding! Ditenagai oleh **z-ai-web-dev-sdk**.

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/telegram-ai-agent?referralCode=deploy)

## ✨ Fitur

- 📝 **Generate Kode** — Buat kode dari deskripsi dalam bahasa apapun
- 🐛 **Debug Kode** — Temukan dan perbaiki bug otomatis
- 🔍 **Code Review** — Analisis kualitas, keamanan, dan performa kode
- 📖 **Jelaskan Kode** — Penjelasan step-by-step untuk kode yang kompleks
- 💬 **Chat AI** — Diskusi tentang programming dan teknologi
- 🔄 **Mode Percakapan** — Switch antara mode coding, debug, review, dll
- 🎛️ **Inline Keyboard** — Navigasi profesional dengan tombol interaktif
- 📎 **File Upload** — Kirim file kode langsung untuk di-review
- 🕐 **Context Memory** — Mengingat konteks percakapan
- 🛡️ **Rate Limiting** — Proteksi dari spam/abuse

## 🚀 Quick Deploy

### One-Click Deploy ke Railway

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new?template=https://github.com/Stonepath-dotcom/telegram-ai-agent&envs=BOT_TOKEN&BOT_TOKENDesc=Your+Telegram+Bot+Token+from+@BotFather)

1. Klik tombol di atas
2. Set `BOT_TOKEN` dengan token dari @BotFather
3. Deploy! Bot langsung jalan 24/7 🎉

### Manual Deploy

```bash
# Clone repo
git clone https://github.com/Stonepath-dotcom/telegram-ai-agent.git
cd telegram-ai-agent

# Install dependencies
npm install

# Set environment variables
export BOT_TOKEN=your_telegram_bot_token_here

# Jalankan bot
npm start
```

## 🛠️ Commands

| Command | Deskripsi | Contoh |
|---------|-----------|--------|
| `/start` | Welcome message | `/start` |
| `/help` | Panduan lengkap | `/help` |
| `/code` | Generate kode | `/code buat REST API Express.js` |
| `/review` | Review kualitas kode | `/review <paste kode>` |
| `/debug` | Debug kode yang error | `/debug <kode> \| ERROR: <pesan>` |
| `/explain` | Jelaskan kode | `/explain <paste kode>` |
| `/chat` | Mode chat biasa | `/chat jelaskan tentang React hooks` |
| `/mode` | Ganti mode percakapan | `/mode code` |
| `/clear` | Hapus riwayat chat | `/clear` |
| `/stats` | Statistik bot | `/stats` |

## 🐳 Docker Deployment

```bash
cp .env.example .env
# Edit .env dan set BOT_TOKEN
docker-compose up -d
```

## ⚙️ Environment Variables

| Variable | Default | Deskripsi |
|----------|---------|-----------|
| `BOT_TOKEN` | *required* | Telegram Bot Token |
| `BOT_USERNAME` | AICodingAgentBot | Bot username |
| `AI_MODEL` | default | AI model name |
| `MAX_TOKENS` | 4096 | Max token per respons |
| `TEMPERATURE` | 0.7 | AI creativity (0-1) |
| `MAX_HISTORY` | 20 | Maks pesan dalam riwayat |
| `HISTORY_TTL` | 3600 | TTL riwayat (detik) |
| `RATE_LIMIT` | 10 | Max request per menit |
| `ADMIN_USERS` | (none) | Telegram user ID admin |

## 📁 Project Structure

```
telegram-ai-agent/
├── src/
│   ├── index.js              # Main entry point
│   ├── commands/index.js     # Command handlers + keyboards
│   ├── handlers/
│   │   ├── message.handler.js  # Text & document handlers
│   │   └── callback.handler.js # Inline button handlers
│   ├── services/
│   │   ├── ai.service.js       # AI service (z-ai-web-dev-sdk)
│   │   ├── history.service.js  # Chat history management
│   │   └── rate-limit.service.js # Rate limiting
│   └── utils/
│       ├── formatter.js        # Message formatting
│       └── keyboards.js        # Professional inline keyboards
├── config/default.js          # Configuration
├── Dockerfile                 # Docker image
├── docker-compose.yml         # Docker Compose
├── ecosystem.config.cjs       # PM2 config
└── package.json
```

## 📝 License

MIT License - Free to use and modify!
