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
    await ctx.reply('❌ Gagal generate kode. Coba lagi nanti.', backHomeKeyboard());
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
    await ctx.reply('❌ Gagal mereview kode. Coba lagi nanti.', backHomeKeyboard());
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
    await ctx.reply('❌ Gagal mendebug kode. Coba lagi nanti.', backHomeKeyboard());
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
    await ctx.reply('❌ Gagal menjelaskan kode. Coba lagi nanti.', backHomeKeyboard());
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
    await ctx.reply('❌ Gagal memproses pesan. Coba lagi nanti.', backHomeKeyboard());
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
