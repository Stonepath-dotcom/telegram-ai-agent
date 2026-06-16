import { Telegraf } from 'telegraf';
import config from '../config/default.js';
import aiService from './services/ai.service.js';
import historyService from './services/history.service.js';
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
  handleAiStatus,
} from './commands/index.js';
import { handleMessage, handleDocument } from './handlers/message.handler.js';
import { handleCallbackQuery } from './handlers/callback.handler.js';

/**
 * Glo Agent — Telegram AI Coding Assistant
 *
 * Premium AI bot untuk menulis, menelaah, debug, dan menjelaskan kode.
 * Powered by z-ai-web-dev-sdk
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

  console.log(`📩 [${new Date().toISOString()}] ${userInfo}: ${ctx.message?.text || ctx.callbackQuery?.data || '[non-text]'}`);

  await next();

  const duration = Date.now() - start;
  console.log(`✅ [${duration}ms] Response sent`);
});

// Admin check middleware
const isAdmin = (userId) => config.adminUsers.includes(userId);

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
bot.command('aistatus', handleAiStatus);

// ============================================
// MESSAGE HANDLERS
// ============================================

// Handle document/file messages
bot.on('document', handleDocument);

// Handle regular text messages
bot.on('text', handleMessage);

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
    console.log('✦  Starting Glo Agent...');
    console.log('✦  Initializing AI service...');

    // Initialize AI service (non-blocking - bot starts even if AI init fails)
    try {
      await aiService.initialize();
      if (aiService.initialized) {
        console.log('✅ AI service initialized');
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

    // Verify bot token by calling getMe
    console.log('✦  Verifying bot token...');
    const botInfo = await bot.telegram.getMe();
    console.log(`✦  Bot verified: @${botInfo.username} (ID: ${botInfo.id})`);

    // Start bot with explicit polling config
    // Handle 409 conflict errors gracefully - don't exit, just retry after delay
    console.log('✦  Starting long polling...');

    const launchBot = (retryCount = 0) => {
      bot.launch({
        allowedUpdates: ['message', 'callback_query'],
        dropPendingUpdates: true,
      }).catch(err => {
        const is409Conflict = err.message && err.message.includes('409');
        if (is409Conflict && retryCount < 5) {
          // Another bot instance is still running - wait and retry
          console.warn(`⚠️ 409 Conflict (another instance running). Retrying in ${5 * (retryCount + 1)}s... [attempt ${retryCount + 1}/5]`);
          setTimeout(() => launchBot(retryCount + 1), 5000 * (retryCount + 1));
        } else {
          console.error('❌ Bot launch error:', err.message);
          if (is409Conflict) {
            console.error('❌ Multiple 409 conflicts. Another bot instance may be running elsewhere.');
            console.error('❌ Stopping to prevent restart loop.');
            // Don't exit - let Railway keep this container alive, just no polling
          } else {
            process.exit(1);
          }
        }
      });
    };

    launchBot();

    // Give polling a moment to establish, then print success
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('');
    console.log('✦ ═══════════════════════════════════════');
    console.log('✦  G L O   A G E N T   —   O N L I N E   ✦');
    console.log('✦ ═══════════════════════════════════════');
    console.log('');
    console.log(`◆ Bot Name : @${botInfo.username}`);
    console.log(`◆ Bot ID   : ${botInfo.id}`);
    console.log('');
    console.log('◆ Commands available:');
    console.log('   /start    — Welcome message');
    console.log('   /help     — Detailed help');
    console.log('   /code     — Generate code');
    console.log('   /review   — Review code');
    console.log('   /debug    — Debug code');
    console.log('   /explain  — Explain code');
    console.log('   /chat     — Chat mode');
    console.log('   /mode     — Change mode');
    console.log('   /clear    — Clear history');
    console.log('   /stats    — Bot statistics');
    console.log('   /aistatus — Cek konfigurasi AI & test connection');
    console.log('');
    console.log('✦  Press Ctrl+C to stop');
    console.log('');

    // Keep-alive heartbeat
    setInterval(() => {
      const mem = process.memoryUsage();
      const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1);
      console.log(`✦ Heartbeat | RSS: ${mb(mem.rss)}MB | Active chats: ${historyService.getActiveCount()}`);
    }, 60000);

  } catch (error) {
    console.error('❌ Failed to start bot:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Process-level error handlers to prevent silent crashes
process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught Exception:', err.message);
  console.error(err.stack);
  // Don't exit - try to keep the bot alive
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection:', reason);
  // Don't exit - try to keep the bot alive
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
