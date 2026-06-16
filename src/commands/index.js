import aiService from '../services/ai.service.js';
import historyService from '../services/history.service.js';
import rateLimitService from '../services/rate-limit.service.js';
import { splitMessage } from '../utils/formatter.js';
import {
  mainMenuKeyboard,
  modeKeyboard,
  helpKeyboard,
  statsKeyboard,
  afterResponseKeyboard,
  languageSelectKeyboard,
  backHomeKeyboard,
} from '../utils/keyboards.js';

/**
 * Command Handlers for the Telegram Bot
 * With professional inline keyboards
 */

// ============================================
// /START — Welcome with main menu
// ============================================
export function handleStart(ctx) {
  const userName = ctx.from.first_name || 'Friend';

  const welcomeMessage = `
👋 *Halo, ${userName}!*

Saya *AI Coding Agent* — asisten coding pintar yang siap bantu kamu _menulis, review, debug,_ dan _jelaskan_ kode dalam bahasa pemrograman apapun.

*⚡ Pilih fitur di bawah, atau ketik langsung:*
`;

  return ctx.replyWithMarkdown(welcomeMessage, mainMenuKeyboard());
}

// ============================================
// /HELP — Detailed help with navigation
// ============================================
export function handleHelp(ctx) {
  const helpMessage = `
📚 *Panduan AI Coding Agent*

Ketik command atau gunakan button untuk akses fitur:

🧑‍💻 */code* \`deskripsi\` — Generate kode
🐛 */debug* \`kode\` — Cari & perbaiki bug
🔍 */review* \`kode\` — Review kualitas kode
📖 */explain* \`kode\` — Penjelasan step-by-step
💬 */chat* \`pesan\` — Chat tentang apapun
🔍 */aistatus* — Cek konfigurasi AI & test koneksi

*🔧 Lihat panduan detail tiap fitur:*
`;

  return ctx.replyWithMarkdown(helpMessage, helpKeyboard());
}

// ============================================
// /CODE — Generate code
// ============================================
export async function handleCode(ctx) {
  const userId = ctx.from.id;
  const description = ctx.message.text.replace(/^\/code\s*/i, '').trim();

  if (!description) {
    const msg = `
🧑‍💻 *Generate Kode*

Ketik deskripsi kode yang ingin dibuat.

*Contoh:*
• \`/code buat REST API dengan Express.js\`
• \`/code Python function untuk sort array\`
• \`/code React component untuk login form\`

*Atau pilih bahasa dulu:*
`;
    return ctx.replyWithMarkdown(msg, languageSelectKeyboard());
  }

  const rateCheck = rateLimitService.checkLimit(userId);
  if (!rateCheck.allowed) {
    return ctx.reply(`⏳ Tunggu *${rateCheck.retryAfter}s* sebelum request lagi.`, { parse_mode: 'Markdown' });
  }

  await ctx.replyWithChatAction('typing');

  try {
    historyService.addMessage(userId, 'user', `[CODE] ${description}`);
    historyService.setMode(userId, 'code');

    const history = historyService.getHistory(userId);
    const response = await aiService.generateCode(description, '', history);

    historyService.addMessage(userId, 'assistant', response);

    const parts = splitMessage(response);
    for (let i = 0; i < parts.length; i++) {
      if (i === parts.length - 1) {
        // Last part gets the action keyboard
        await ctx.replyWithMarkdown(parts[i], afterResponseKeyboard('code'));
      } else {
        await ctx.replyWithMarkdown(parts[i]);
      }
    }
  } catch (error) {
    console.error('Code command error:', error);
    const errMsg = String(error.message || error).substring(0, 300);
    await ctx.replyWithMarkdown(
      `❌ *Gagal generate kode.*\n\n*Detail:* \`${errMsg}\`\n\n*Cek konfigurasi:* ketik /aistatus`,
      backHomeKeyboard()
    );
  }
}

// ============================================
// /REVIEW — Review code
// ============================================
export async function handleReview(ctx) {
  const userId = ctx.from.id;
  const code = ctx.message.text.replace(/^\/review\s*/i, '').trim();

  if (!code) {
    const msg = `
🔍 *Code Review*

Kirim kode yang ingin direview.

*Contoh:*
\`\`\`
/review
function add(a, b) {
  return a + b;
}
\`\`\`

*Atau langsung paste kodenya:*
`;
    return ctx.replyWithMarkdown(msg, backHomeKeyboard());
  }

  const rateCheck = rateLimitService.checkLimit(userId);
  if (!rateCheck.allowed) {
    return ctx.reply(`⏳ Tunggu *${rateCheck.retryAfter}s* sebelum request lagi.`, { parse_mode: 'Markdown' });
  }

  await ctx.replyWithChatAction('typing');

  try {
    historyService.addMessage(userId, 'user', `[REVIEW] ${code}`);
    historyService.setMode(userId, 'review');

    const history = historyService.getHistory(userId);
    const response = await aiService.reviewCode(code, history);

    historyService.addMessage(userId, 'assistant', response);

    const parts = splitMessage(response);
    for (let i = 0; i < parts.length; i++) {
      if (i === parts.length - 1) {
        await ctx.replyWithMarkdown(parts[i], afterResponseKeyboard('review'));
      } else {
        await ctx.replyWithMarkdown(parts[i]);
      }
    }
  } catch (error) {
    console.error('Review command error:', error);
    const errMsg = String(error.message || error).substring(0, 300);
    await ctx.replyWithMarkdown(
      `❌ *Gagal mereview kode.*\n\n*Detail:* \`${errMsg}\`\n\n*Cek konfigurasi:* ketik /aistatus`,
      backHomeKeyboard()
    );
  }
}

// ============================================
// /DEBUG — Debug code
// ============================================
export async function handleDebug(ctx) {
  const userId = ctx.from.id;
  const input = ctx.message.text.replace(/^\/debug\s*/i, '').trim();

  if (!input) {
    const msg = `
🐛 *Debug Kode*

Kirim kode yang bermasalah.

*Format:*
• \`/debug <kode kamu>\`
• \`/debug <kode> | ERROR: <pesan error>\`

*Contoh:*
• \`/debug for i in ragne(10): print(i)\`
• \`/debug myFunc() | ERROR: TypeError: undefined\`
`;
    return ctx.replyWithMarkdown(msg, backHomeKeyboard());
  }

  const rateCheck = rateLimitService.checkLimit(userId);
  if (!rateCheck.allowed) {
    return ctx.reply(`⏳ Tunggu *${rateCheck.retryAfter}s* sebelum request lagi.`, { parse_mode: 'Markdown' });
  }

  await ctx.replyWithChatAction('typing');

  try {
    let code = input;
    let errorMsg = '';

    if (input.includes('| ERROR:')) {
      const parts = input.split('| ERROR:');
      code = parts[0].trim();
      errorMsg = parts[1].trim();
    } else if (input.includes('| error:')) {
      const parts = input.split('| error:');
      code = parts[0].trim();
      errorMsg = parts[1].trim();
    }

    historyService.addMessage(userId, 'user', `[DEBUG] ${input}`);
    historyService.setMode(userId, 'debug');

    const history = historyService.getHistory(userId);
    const response = await aiService.debugCode(code, errorMsg, history);

    historyService.addMessage(userId, 'assistant', response);

    const parts = splitMessage(response);
    for (let i = 0; i < parts.length; i++) {
      if (i === parts.length - 1) {
        await ctx.replyWithMarkdown(parts[i], afterResponseKeyboard('debug'));
      } else {
        await ctx.replyWithMarkdown(parts[i]);
      }
    }
  } catch (error) {
    console.error('Debug command error:', error);
    const errMsg = String(error.message || error).substring(0, 300);
    await ctx.replyWithMarkdown(
      `❌ *Gagal mendebug kode.*\n\n*Detail:* \`${errMsg}\`\n\n*Cek konfigurasi:* ketik /aistatus`,
      backHomeKeyboard()
    );
  }
}

// ============================================
// /EXPLAIN — Explain code
// ============================================
export async function handleExplain(ctx) {
  const userId = ctx.from.id;
  const code = ctx.message.text.replace(/^\/explain\s*/i, '').trim();

  if (!code) {
    const msg = `
📖 *Jelaskan Kode*

Kirim kode yang ingin dijelaskan.

*Contoh:*
\`\`\`
/explain
const result = arr.reduce((a,b) => a + b, 0);
\`\`\`
`;
    return ctx.replyWithMarkdown(msg, backHomeKeyboard());
  }

  const rateCheck = rateLimitService.checkLimit(userId);
  if (!rateCheck.allowed) {
    return ctx.reply(`⏳ Tunggu *${rateCheck.retryAfter}s* sebelum request lagi.`, { parse_mode: 'Markdown' });
  }

  await ctx.replyWithChatAction('typing');

  try {
    historyService.addMessage(userId, 'user', `[EXPLAIN] ${code}`);
    historyService.setMode(userId, 'explain');

    const history = historyService.getHistory(userId);
    const response = await aiService.explainCode(code, history);

    historyService.addMessage(userId, 'assistant', response);

    const parts = splitMessage(response);
    for (let i = 0; i < parts.length; i++) {
      if (i === parts.length - 1) {
        await ctx.replyWithMarkdown(parts[i], afterResponseKeyboard('explain'));
      } else {
        await ctx.replyWithMarkdown(parts[i]);
      }
    }
  } catch (error) {
    console.error('Explain command error:', error);
    const errMsg = String(error.message || error).substring(0, 300);
    await ctx.replyWithMarkdown(
      `❌ *Gagal menjelaskan kode.*\n\n*Detail:* \`${errMsg}\`\n\n*Cek konfigurasi:* ketik /aistatus`,
      backHomeKeyboard()
    );
  }
}

// ============================================
// /CHAT — Switch to normal chat
// ============================================
export async function handleChat(ctx) {
  const userId = ctx.from.id;
  const message = ctx.message.text.replace(/^\/chat\s*/i, '').trim();

  historyService.setMode(userId, 'normal');

  if (!message) {
    return ctx.replyWithMarkdown(
      '💬 *Mode Chat aktif!*\n\nKetik pesan apa saja untuk mulai chat.',
      afterResponseKeyboard('normal')
    );
  }

  const rateCheck = rateLimitService.checkLimit(userId);
  if (!rateCheck.allowed) {
    return ctx.reply(`⏳ Tunggu *${rateCheck.retryAfter}s* sebelum request lagi.`, { parse_mode: 'Markdown' });
  }

  await ctx.replyWithChatAction('typing');

  try {
    historyService.addMessage(userId, 'user', message);

    const history = historyService.getHistory(userId);
    const response = await aiService.chat(message, history, 'normal');

    historyService.addMessage(userId, 'assistant', response);

    const parts = splitMessage(response);
    for (let i = 0; i < parts.length; i++) {
      if (i === parts.length - 1) {
        await ctx.replyWithMarkdown(parts[i], afterResponseKeyboard('normal'));
      } else {
        await ctx.replyWithMarkdown(parts[i]);
      }
    }
  } catch (error) {
    console.error('Chat command error:', error);
    const errMsg = String(error.message || error).substring(0, 300);
    await ctx.replyWithMarkdown(
      `❌ *Gagal memproses pesan.*\n\n*Detail:* \`${errMsg}\`\n\n*Cek konfigurasi:* ketik /aistatus`,
      backHomeKeyboard()
    );
  }
}

// ============================================
// /MODE — Change mode with inline keyboard
// ============================================
export function handleMode(ctx) {
  const userId = ctx.from.id;
  const mode = ctx.message.text.replace(/^\/mode\s*/i, '').trim().toLowerCase();
  const validModes = ['normal', 'code', 'debug', 'review', 'explain'];

  if (mode && validModes.includes(mode)) {
    historyService.setMode(userId, mode);
    const modeNames = {
      normal: '💬 Chat Biasa',
      code: '🧑‍💻 Generate Kode',
      debug: '🐛 Debugging',
      review: '🔍 Code Review',
      explain: '📖 Penjelasan Kode',
    };
    return ctx.replyWithMarkdown(
      `✅ *Mode aktif:* ${modeNames[mode]}`,
      afterResponseKeyboard(mode)
    );
  }

  // Show mode selector keyboard
  const currentMode = historyService.getMode(userId);
  return ctx.replyWithMarkdown(
    `🔄 *Pilih Mode*\n\nMode saat ini: \`${currentMode}\``,
    modeKeyboard(currentMode)
  );
}

// ============================================
// /CLEAR — Clear history with confirmation
// ============================================
export function handleClear(ctx) {
  const userId = ctx.from.id;
  historyService.clearHistory(userId);
  return ctx.replyWithMarkdown(
    '🗑️ *Riwayat dihapus!*\n\nPercakapan baru dimulai.',
    mainMenuKeyboard()
  );
}

// ============================================
// /STATS — Statistics with refresh
// ============================================
export function handleStats(ctx) {
  const userId = ctx.from.id;
  const activeConversations = historyService.getActiveCount();
  const remaining = rateLimitService.getRemaining(userId);
  const currentMode = historyService.getMode(userId);
  const history = historyService.getHistory(userId);

  const modeNames = {
    normal: '💬 Chat Biasa',
    code: '🧑‍💻 Generate Kode',
    debug: '🐛 Debugging',
    review: '🔍 Code Review',
    explain: '📖 Penjelasan Kode',
  };

  const statsMessage = `
📊 *Bot Statistics*

┌─────────────────────
│ 🔄 Mode: *${modeNames[currentMode] || currentMode}*
│ 💬 Chat aktif: *${activeConversations}*
│ 📝 Pesan di riwayat: *${history.length}*
│ ⚡ Sisa request: *${remaining}/min*
│ 👤 User ID: \`${userId}\`
└─────────────────────
`;

  return ctx.replyWithMarkdown(statsMessage, statsKeyboard());
}

// ============================================
// /AISTATUS — Diagnostic command for AI service
// ============================================
export async function handleAiStatus(ctx) {
  try {
    await ctx.replyWithChatAction('typing');

    // Force re-initialize to pick up latest env vars
    if (!aiService.initialized) {
      await aiService.initialize();
    }

    const status = aiService.getStatus();

    let msg = `
🔍 *AI Service Status*

┌─────────────────────
│ ✅ Initialized: *${status.initialized ? 'YES' : 'NO'}*
│ 🌐 Provider: *${status.provider || '(none)'}*
│ 🌍 Base URL: \`${status.baseUrl || '-'}\`
│ 🤖 Model: \`${status.model || '-'}\`
│ 🔑 API Key set: *${status.hasApiKey ? 'YES' : 'NO'}*
│ 🔑 Key (masked): \`${status.apiKeyMasked}\`
│ 🔑 Key length: *${status.apiKeyLength} chars*
└─────────────────────

*Env vars:*
│ • \`AI_PROVIDER=${status.envProvider}\`
│ • \`AI_MODEL=${status.envModel}\`
│ • \`AI_BASE_URL=${status.envBaseUrl}\`
`;

    if (!status.initialized) {
      msg += `
❌ *AI service belum terkonfigurasi!*

*Fix:*
1. Buka Railway dashboard
2. Pilih service telegram-ai-agent
3. Tab *Variables*
4. Tambah:
   • \`AI_PROVIDER=groq\`
   • \`AI_API_KEY=gsk_xxxxxxxx\`
5. Save → auto-redeploy
6. Tunggu 1-2 menit
7. Coba lagi
`;
    } else {
      msg += `\n🧪 *Testing connection...*`;
      await ctx.replyWithMarkdown(msg);

      const test = await aiService.testConnection();
      const testMsg = test.ok
        ? `✅ *Test connection: BERHASIL*\n\n📡 Model: \`${test.model}\`\n💬 Response: \`${test.message}\``
        : `❌ *Test connection: GAGAL*\n\n📡 Model: \`${test.model}\`\n❗ Error: \`${String(test.message).substring(0, 400)}\`\n\n*Possible causes:*\n• API key salah/expired\n• Model tidak tersedia di akun\n• Rate limit terkena\n• Network issue`;

      return ctx.replyWithMarkdown(testMsg, backHomeKeyboard());
    }

    return ctx.replyWithMarkdown(msg, backHomeKeyboard());
  } catch (error) {
    console.error('AiStatus command error:', error);
    return ctx.replyWithMarkdown(
      `❌ *Gagal cek status AI.*\n\n*Error:* \`${String(error.message).substring(0, 200)}\``,
      backHomeKeyboard()
    );
  }
}
