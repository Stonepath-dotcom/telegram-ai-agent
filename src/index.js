import { Telegraf } from 'telegraf';
import config from '../config/default.js';
import aiService from './services/ai.service.js';
import historyService from './services/history.service.js';
import premiumService from './services/premium.service.js';
import memoryService from './services/memory.service.js';
import {
  handleStart,
  handleHelp,
  handleCode,
  handleReview,
  handleDebug,
  handleExplain,
  handleChat,
  handleMode,
  handleClear,
  handleStats,
  handleMyStats,
  handleAiStatus,
  handleTier,
  handleMemory,
  handleSearch,
  handleImage,
  handleVoice,
  handleTTS,
  handleRun,
  handleAsk,
} from './commands/index.js';
import { handleMessage, handleDocument, handlePhoto, handleVoice as handleVoiceMessage } from './handlers/message.handler.js';
import { handleCallbackQuery, handleInlineQuery } from './handlers/callback.handler.js';

/**
 * Glo Agent v3 — Premium Telegram AI Coding Assistant
 *
 * Features:
 *   Core: /code /debug /review /explain /chat
 *   Vision: photo & image file analysis via Groq llama-4-scout
 *   Voice: ASR via Groq Whisper (voice note → text → AI)
 *   TTS: text-to-speech (Z.ai SDK infra)
 *   Web: /search real-time web search (DuckDuckGo default)
 *   Memory: long-term memory (preferences, facts)
 *   Streaming: real-time typing for premium users
 *   Multi-model: simple→fast model, complex→primary model
 *   Premium tier: free limits vs unlimited premium
 *   Inline mode: @bot query from any chat
 *   Diagnostics: /aistatus
 */

// Validate configuration
if (!config.bot.token || config.bot.token === 'YOUR_TELEGRAM_BOT_TOKEN_HERE') {
  console.error('❌ ERROR: BOT_TOKEN not set!');
  console.error('Please set the BOT_TOKEN environment variable:');
  console.error('  export BOT_TOKEN=your_telegram_bot_token');
  console.error('');
  console.error('Get a token from @BotFather on Telegram');
  process.exit(1);
}

// Create bot instance
const bot = new Telegraf(config.bot.token);

// ============================================
// MIDDLEWARE
// ============================================

// Logging middleware
bot.use(async (ctx, next) => {
  const start = Date.now();
  const userInfo = ctx.from
    ? `${ctx.from.id} (${ctx.from.first_name || ''} ${ctx.from.last_name || ''})`
    : 'Unknown';

  const msgType = ctx.inlineQuery
    ? `inline: "${ctx.inlineQuery.query?.substring(0, 50) || ''}"`
    : ctx.message?.text
      ? ctx.message.text.substring(0, 80)
      : ctx.message?.photo
        ? '[photo]'
        : ctx.message?.voice
          ? '[voice]'
          : ctx.message?.document
            ? `[file: ${ctx.message.document.file_name || ''}]`
            : ctx.callbackQuery?.data || '[non-text]';

  console.log(`📩 [${new Date().toISOString()}] ${userInfo}: ${msgType}`);

  await next();

  const duration = Date.now() - start;
  console.log(`✅ [${duration}ms] Response sent`);
});

// ============================================
// COMMAND HANDLERS
// ============================================

bot.start(handleStart);
bot.help(handleHelp);

bot.command('code', handleCode);
bot.command('review', handleReview);
bot.command('debug', handleDebug);
bot.command('explain', handleExplain);
bot.command('chat', handleChat);
bot.command('mode', handleMode);
bot.command('clear', handleClear);
bot.command('stats', handleStats);
bot.command('mystats', handleMyStats);
bot.command('tier', handleTier);
bot.command('memory', handleMemory);
bot.command('search', handleSearch);
bot.command('image', handleImage);
bot.command('voice', handleVoice);
bot.command('tts', handleTTS);
bot.command('aistatus', handleAiStatus);
bot.command('run', handleRun);
bot.command('ask', handleAsk);

// ============================================
// MESSAGE HANDLERS (ordered: photo, voice, document, text)
// ============================================

bot.on('photo', handlePhoto);
bot.on('voice', handleVoiceMessage);
bot.on('document', handleDocument);
bot.on('text', handleMessage);

// ============================================
// INLINE MODE (@bot query)
// ============================================

bot.on('inline_query', handleInlineQuery);

// ============================================
// CALLBACK QUERY HANDLERS
// ============================================

bot.on('callback_query', handleCallbackQuery);

// ============================================
// ERROR HANDLING
// ============================================

bot.catch((err, ctx) => {
  console.error('❌ Bot Error:', err);
  const errLine = String(err?.message || err).substring(0, 200);
  ctx.reply(`⚠️ Terjadi kesalahan.\n\nDetail: ${errLine}\n\nCoba lagi atau ketik /aistatus untuk cek status AI.`).catch(() => {});
});

// ============================================
// STARTUP
// ============================================

async function startBot() {
  try {
    console.log('✦  Starting Glo Agent v3...');
    console.log('✦  Initializing AI service...');

    try {
      await aiService.initialize();
      if (aiService.initialized) {
        console.log('✅ AI service initialized');
        console.log(`   Provider: ${aiService.provider} | Model: ${aiService.model}`);
        console.log(`   Vision: ${aiService.visionModel} | Fast: ${aiService.fastModel}`);
      } else {
        console.log('⚠️ AI service NOT initialized - AI features will not work');
        console.log('⚠️ To enable AI, set these env vars:');
        console.log('⚠️   AI_PROVIDER=groq (or openai, openrouter, together)');
        console.log('⚠️   AI_API_KEY=your_api_key');
        console.log('⚠️ Get free Groq API key at: https://console.groq.com/keys');
      }
    } catch (aiErr) {
      console.log('⚠️ AI service init failed:', aiErr.message);
      console.log('⚠️ Bot will start but AI features will not work');
    }

    console.log('✦  Verifying bot token...');
    const botInfo = await bot.telegram.getMe();
    console.log(`✦  Bot verified: @${botInfo.username} (ID: ${botInfo.id})`);

    // Enable inline mode support
    try {
      await bot.telegram.setMyCommands([
        { command: 'start', description: 'Welcome & menu utama' },
        { command: 'help', description: 'Panduan lengkap' },
        { command: 'code', description: '⚡ Generate kode' },
        { command: 'debug', description: '🐛 Debug kode' },
        { command: 'review', description: '🔍 Review kode' },
        { command: 'explain', description: '📖 Jelaskan kode' },
        { command: 'chat', description: '💬 Chat bebas' },
        { command: 'search', description: '🌐 Web search' },
        { command: 'image', description: '🖼️ Analisa gambar (vision)' },
        { command: 'voice', description: '🎤 Voice input (ASR)' },
        { command: 'tts', description: '🔊 Text-to-speech' },
        { command: 'memory', description: '🧠 Lihat memori bot' },
        { command: 'tier', description: '💎 Cek tier & kuota' },
        { command: 'mystats', description: '📊 Statistik penggunaan' },
        { command: 'clear', description: '🗑️ Hapus riwayat chat' },
        { command: 'aistatus', description: '🔍 Cek konfigurasi AI' },
        { command: 'run', description: '💻 Jalankan kode di sandbox (30+ bahasa)' },
        { command: 'ask', description: '🤖 AI agent dengan tools (auto run_code + web_search)' },
      ]);
      console.log('✦  Bot commands registered with Telegram');
    } catch (cmdErr) {
      console.warn('⚠️ Failed to register commands:', cmdErr.message);
    }

    console.log('✦  Starting long polling...');

    const launchBot = (retryCount = 0) => {
      bot.launch({
        allowedUpdates: ['message', 'callback_query', 'inline_query'],
        dropPendingUpdates: true,
      }).catch(err => {
        const is409Conflict = err.message && err.message.includes('409');
        if (is409Conflict && retryCount < 5) {
          console.warn(`⚠️ 409 Conflict (another instance running). Retrying in ${5 * (retryCount + 1)}s... [attempt ${retryCount + 1}/5]`);
          setTimeout(() => launchBot(retryCount + 1), 5000 * (retryCount + 1));
        } else {
          console.error('❌ Bot launch error:', err.message);
          if (is409Conflict) {
            console.error('❌ Multiple 409 conflicts. Another bot instance may be running elsewhere.');
          } else {
            process.exit(1);
          }
        }
      });
    };

    launchBot();

    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('');
    console.log('✦ ═══════════════════════════════════════');
    console.log('✦  G L O   A G E N T   v3   —   O N L I N E');
    console.log('✦ ═══════════════════════════════════════');
    console.log('');
    console.log(`◆ Bot Name    : @${botInfo.username}`);
    console.log(`◆ Bot ID      : ${botInfo.id}`);
    console.log(`◆ AI Provider : ${aiService.provider || '(not configured)'}`);
    console.log(`◆ AI Model    : ${aiService.model || '-'}`);
    console.log(`◆ Vision      : ${aiService.visionModel || '-'}`);
    console.log(`◆ Fast        : ${aiService.fastModel || '-'}`);
    console.log('');
    console.log('◆ Commands available:');
    console.log('   /start    — Welcome + menu');
    console.log('   /help     — Detailed help');
    console.log('   /code     — Generate code');
    console.log('   /review   — Review code');
    console.log('   /debug    — Debug code');
    console.log('   /explain  — Explain code');
    console.log('   /chat     — Chat (streaming for premium)');
    console.log('   /mode     — Change mode');
    console.log('   /search   — Web search');
    console.log('   /image    — Vision/image help');
    console.log('   /voice    — Voice ASR help');
    console.log('   /tts      — Text-to-speech');
    console.log('   /memory   — Long-term memory');
    console.log('   /tier     — Premium tier & quota');
    console.log('   /mystats  — Usage statistics');
    console.log('   /clear    — Clear history');
    console.log('   /aistatus — AI diagnostics');
    console.log('   /run      — Execute code in sandbox (30+ languages)');
    console.log('   /ask      — AI agent with autonomous tool calling');
    console.log('');
    console.log('◆ Media handlers: photo, voice, document (auto-detected)');
    console.log('◆ Inline mode: @' + botInfo.username + ' <query>');
    console.log('');
    console.log('✦  Press Ctrl+C to stop');
    console.log('');

    // Heartbeat
    setInterval(() => {
      const mem = process.memoryUsage();
      const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1);
      console.log(`✦ Heartbeat | RSS: ${mb(mem.rss)}MB | Chats: ${historyService.getActiveCount()} | Premium users: ${premiumService.getStats ? 'active' : 'N/A'}`);
    }, 60000);

  } catch (error) {
    console.error('❌ Failed to start bot:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Process-level error handlers
process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught Exception:', err.message);
  console.error(err.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection:', reason);
});

// Graceful shutdown
const shutdown = async (signal) => {
  console.log(`\n${signal} received. Glo Agent shutting down gracefully...`);
  bot.stop(signal);
  historyService.stopCleanup();
  console.log('✦  Glo Agent stopped. Goodbye!');
  process.exit(0);
};

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

// Start the bot
startBot();

export default bot;
