import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import aiService from '../services/ai.service.js';
import historyService from '../services/history.service.js';
import rateLimitService from '../services/rate-limit.service.js';
import memoryService from '../services/memory.service.js';
import premiumService from '../services/premium.service.js';
import voiceService from '../services/voice.service.js';
import webSearchService from '../services/web-search.service.js';
import sandboxService from '../services/sandbox.service.js';
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

// Resolve banner asset path (works both in dev and in Railway container /app)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// src/commands/ -> ../../assets/banners/
const BANNER_DIR = path.resolve(__dirname, '../../assets/banners');
const START_BANNER = path.join(BANNER_DIR, 'glo-agent-hero-v2.png');
const HELP_BANNER = path.join(BANNER_DIR, 'glo-agent-features-grid.png');

// Pre-load banner buffers at module init so we know immediately if they're missing.
// Buffer-based source is more reliable with Telegraf than fs.createReadStream.
const START_BANNER_BUF = (() => {
  try {
    if (fs.existsSync(START_BANNER)) return fs.readFileSync(START_BANNER);
    console.warn(`⚠️  Start banner not found at: ${START_BANNER}`);
  } catch (e) {
    console.warn(`⚠️  Failed to load start banner: ${e?.message}`);
  }
  return null;
})();
const HELP_BANNER_BUF = (() => {
  try {
    if (fs.existsSync(HELP_BANNER)) return fs.readFileSync(HELP_BANNER);
    console.warn(`⚠️  Help banner not found at: ${HELP_BANNER}`);
  } catch (e) {
    console.warn(`⚠️  Failed to load help banner: ${e?.message}`);
  }
  return null;
})();

console.log(`🖼️  Banner dir: ${BANNER_DIR}`);
console.log(`🖼️  Start banner: ${START_BANNER_BUF ? `loaded (${START_BANNER_BUF.length} bytes)` : 'MISSING'}`);
console.log(`🖼️  Help banner:  ${HELP_BANNER_BUF ? `loaded (${HELP_BANNER_BUF.length} bytes)` : 'MISSING'}`);

function fileExists(p) {
  try {
    return fs.existsSync(p) && fs.statSync(p).size > 0;
  } catch {
    return false;
  }
}

// Send a banner photo (with optional caption) — silent no-op if buffer is null.
// Returns true on success, false on failure.
async function sendBanner(ctx, bannerBuf, caption) {
  if (!bannerBuf) return false;
  try {
    if (caption) {
      await ctx.replyWithPhoto(
        { source: bannerBuf },
        { caption, parse_mode: 'Markdown' }
      );
    } else {
      await ctx.replyWithPhoto({ source: bannerBuf });
    }
    return true;
  } catch (e) {
    console.warn('Banner send failed:', e?.message);
    return false;
  }
}

/**
 * Glo Agent — Command Handlers v3
 *
 * Premium edition with:
 * - Onboarding /start with branded persona
 * - /search, /image, /voice, /tts, /memory, /tier commands
 * - Streaming-aware /chat for real-time typing
 */

// ============================================
// /START — Premium onboarding (banner + welcome)
// ============================================
export async function handleStart(ctx) {
  const userName = ctx.from.first_name || 'Friend';
  const isPremium = premiumService.isPremium(ctx.from.id);

  // Store user info in memory
  memoryService.savePreference(ctx.from.id, 'name', userName);
  memoryService.savePreference(ctx.from.id, 'firstSeen', Date.now());

  // 1) Send the hero banner as a photo (silent fallback if missing).
  //    Telegram captions are limited to 1024 chars — keep this short.
  const bannerCaption = isPremium
    ? `💎 *glo Agent*  ·  Premium\nYour AI pair programmer — Vision · Voice · Code · Web`
    : `✨ *glo Agent*\nYour AI pair programmer — Vision · Voice · Code · Web`;
  await sendBanner(ctx, START_BANNER_BUF, bannerCaption);

  // 2) Full welcome text + main menu keyboard as a follow-up message.
  const welcomeMessage = `
Halo, *${userName}* 👋

Saya *Glo* — partner coding premium kamu. Saya bisa nulis, telaah, debug, dan jelaskan kode dalam bahasa apapun. Plus sekarang saya punya mata 👁️, telinga 🎤, dan akses internet 🌐.

*Cara pakai:*
• Ketik command langsung, atau
• Tap tombol di bawah, atau
• Kirim *foto* screenshot → auto-analisa
• Kirim *voice* → auto-transcribe
• Ketik "cari ..." → web search

*Status kamu:* ${isPremium ? '💎 Premium (unlimited)' : '🆓 Free tier'}

Pilih fitur di bawah 👇
`;

  try {
    return await ctx.replyWithMarkdown(welcomeMessage, mainMenuKeyboard(isPremium));
  } catch (e) {
    return ctx.reply(welcomeMessage.replace(/[*_`~]/g, ''), mainMenuKeyboard(isPremium));
  }
}

// ============================================
// /HELP
// ============================================
export async function handleHelp(ctx) {
  // Optional: send features-grid banner first
  await sendBanner(ctx, HELP_BANNER_BUF);

  const helpMessage = `
✨ *Panduan Glo Agent*
━━━━━━━━━━━━━━━━━━━━

*Core Features:*
⚡ \`/code <deskripsi>\` — Generate kode
🐛 \`/debug <kode>\` — Cari & perbaiki bug
🔍 \`/review <kode>\` — Telaah kualitas kode
📖 \`/explain <kode>\` — Penjelasan step-by-step
💬 \`/chat <pesan>\` — Chat bebas

*Premium Features:*
🖼️ \`/image <prompt>\` — Kirim/kutip gambar untuk dianalisa
🌐 \`/search <query>\` — Web search real-time
🎤 \`/voice\` — Voice input (kirim voice note)
🔊 \`/tts <teks>\` — Text-to-speech

*Agent & Tools:*
💻 \`/run <lang> <code>\` — Eksekusi kode di sandbox (Piston, 30+ bahasa)
🤖 \`/ask <pertanyaan>\` — AI agent otonom (auto pakai run_code & web_search)

*Memory & Stats:*
🧠 \`/memory\` — Lihat & kelola memori bot
📊 \`/mystats\` — Statistik penggunaan kamu
🗑️ \`/clear\` — Hapus riwayat percakapan
💎 \`/tier\` — Cek tier & kuota kamu

*Diagnostic:*
🔍 \`/aistatus\` — Cek konfigurasi AI & test koneksi

*Tips:*
• Bisa kirim file kode (.py, .js, .ts, dll) — auto-analisa
• Bisa kirim foto screenshot error — auto-vision
• Bisa kirim voice note — auto-transcribe

Pilih panduan detail di bawah 👇
`;

  try {
    return ctx.replyWithMarkdown(helpMessage, helpKeyboard());
  } catch (e) {
    return ctx.reply(helpMessage.replace(/[*_`~]/g, ''), helpKeyboard());
  }
}

// ============================================
// /CODE
// ============================================
export async function handleCode(ctx) {
  const userId = ctx.from.id;
  const description = ctx.message.text.replace(/^\/code\s*/i, '').trim();

  if (!description) {
    const msg = `
⚡ *Generate Kode*

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

  const quota = premiumService.checkAndIncrement(userId, 'messages');
  if (!quota.allowed) {
    return ctx.replyWithMarkdown(`🆓 *Kuota harian habis* (${quota.limit} pesan/hari).\n\n💎 Upgrade Premium untuk unlimited.`);
  }

  await ctx.replyWithChatAction('typing');

  try {
    historyService.addMessage(userId, 'user', `[CODE] ${description}`);
    historyService.setMode(userId, 'code');

    const history = historyService.getHistory(userId);
    const response = await aiService.generateCode(description, '', history);

    historyService.addMessage(userId, 'assistant', response);

    await _sendLong(ctx, response, 'code');
  } catch (error) {
    await _handleCmdError(ctx, error, 'generate kode');
  }
}

// ============================================
// /REVIEW
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
`;
    return ctx.replyWithMarkdown(msg, backHomeKeyboard());
  }

  const rateCheck = rateLimitService.checkLimit(userId);
  if (!rateCheck.allowed) {
    return ctx.reply(`⏳ Tunggu *${rateCheck.retryAfter}s* sebelum request lagi.`, { parse_mode: 'Markdown' });
  }

  const quota = premiumService.checkAndIncrement(userId, 'messages');
  if (!quota.allowed) {
    return ctx.replyWithMarkdown(`🆓 *Kuota harian habis.*\n\n💎 Upgrade Premium untuk unlimited.`);
  }

  await ctx.replyWithChatAction('typing');

  try {
    historyService.addMessage(userId, 'user', `[REVIEW] ${code}`);
    historyService.setMode(userId, 'review');

    const history = historyService.getHistory(userId);
    const response = await aiService.reviewCode(code, history);

    historyService.addMessage(userId, 'assistant', response);
    await _sendLong(ctx, response, 'review');
  } catch (error) {
    await _handleCmdError(ctx, error, 'mereview kode');
  }
}

// ============================================
// /DEBUG
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

  const quota = premiumService.checkAndIncrement(userId, 'messages');
  if (!quota.allowed) {
    return ctx.replyWithMarkdown(`🆓 *Kuota harian habis.*\n\n💎 Upgrade Premium untuk unlimited.`);
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
    await _sendLong(ctx, response, 'debug');
  } catch (error) {
    await _handleCmdError(ctx, error, 'mendebug kode');
  }
}

// ============================================
// /EXPLAIN
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

  const quota = premiumService.checkAndIncrement(userId, 'messages');
  if (!quota.allowed) {
    return ctx.replyWithMarkdown(`🆓 *Kuota harian habis.*\n\n💎 Upgrade Premium untuk unlimited.`);
  }

  await ctx.replyWithChatAction('typing');

  try {
    historyService.addMessage(userId, 'user', `[EXPLAIN] ${code}`);
    historyService.setMode(userId, 'explain');

    const history = historyService.getHistory(userId);
    const response = await aiService.explainCode(code, history);

    historyService.addMessage(userId, 'assistant', response);
    await _sendLong(ctx, response, 'explain');
  } catch (error) {
    await _handleCmdError(ctx, error, 'menjelaskan kode');
  }
}

// ============================================
// /CHAT — with optional streaming
// ============================================
export async function handleChat(ctx) {
  const userId = ctx.from.id;
  const message = ctx.message.text.replace(/^\/chat\s*/i, '').trim();

  historyService.setMode(userId, 'normal');

  if (!message) {
    return ctx.replyWithMarkdown(
      '💬 *Mode Chat aktif.*\n\nKetik pesan apa saja untuk mulai chat.\n\n_Tips: kirim foto/voice/file untuk fitur lain_',
      afterResponseKeyboard('normal')
    );
  }

  const rateCheck = rateLimitService.checkLimit(userId);
  if (!rateCheck.allowed) {
    return ctx.reply(`⏳ Tunggu *${rateCheck.retryAfter}s* sebelum request lagi.`, { parse_mode: 'Markdown' });
  }

  const quota = premiumService.checkAndIncrement(userId, 'messages');
  if (!quota.allowed) {
    return ctx.replyWithMarkdown(`🆓 *Kuota harian habis.*\n\n💎 Upgrade Premium untuk unlimited.`);
  }

  // Try streaming for premium users; non-streaming for free (saves API calls)
  const useStreaming = premiumService.isPremium(userId);
  const history = historyService.getHistory(userId);

  try {
    memoryService.detectAndStoreFromMessage(userId, message);
    historyService.addMessage(userId, 'user', message);

    await ctx.replyWithChatAction('typing');

    if (useStreaming) {
      // Streaming path: send placeholder, then edit as chunks arrive
      let sentMsg = await ctx.replyWithMarkdown('⏳ _Glo sedang mikir..._');
      let buffer = '';
      let lastEditAt = 0;
      let editPending = false;
      const chatId = sentMsg.chat.id;
      const messageId = sentMsg.message_id;

      const onChunk = async (chunk) => {
        buffer += chunk;
        const now = Date.now();
        if (now - lastEditAt > 1200 && buffer.length > 30) {
          lastEditAt = now;
          editPending = true;
          try {
            await ctx.telegram.editMessageText(
              chatId, messageId, undefined,
              buffer.substring(0, 4000) + '\n\n_⌨️ ..._',
              { parse_mode: 'Markdown' }
            );
          } catch (e) { /* rate limit / parse error — ignore */ }
          editPending = false;
        }
      };

      try {
        for await (const chunk of aiService.streamChat(message, history, 'normal')) {
          await onChunk(chunk);
        }
      } catch (streamErr) {
        console.warn('Stream failed, fallback to non-stream:', streamErr.message);
        buffer = await aiService.chat(message, history, 'normal');
      }

      // Final edit — split if needed
      const parts = splitMessage(buffer || '(empty response)', 3900);
      // Edit original message to first part
      try {
        await ctx.telegram.editMessageText(
          chatId, messageId, undefined,
          parts[0],
          parts.length > 1
            ? { parse_mode: 'Markdown' }
            : { parse_mode: 'Markdown', ...afterResponseKeyboard('normal') }
        );
      } catch (e) {
        // Markdown failed — try plain
        try {
          await ctx.telegram.editMessageText(chatId, messageId, undefined, parts[0].replace(/[*_`~\[\]]/g, ''));
        } catch (e2) { /* ignore */ }
      }

      // Send additional parts
      for (let i = 1; i < parts.length; i++) {
        if (i === parts.length - 1) {
          try {
            await ctx.replyWithMarkdown(parts[i], afterResponseKeyboard('normal'));
          } catch (e) {
            await ctx.reply(parts[i].replace(/[*_`~\[\]]/g, ''));
          }
        } else {
          try {
            await ctx.replyWithMarkdown(parts[i]);
          } catch (e) {
            await ctx.reply(parts[i].replace(/[*_`~\[\]]/g, ''));
          }
        }
      }

      historyService.addMessage(userId, 'assistant', buffer || '');
    } else {
      // Non-streaming for free users
      const response = await aiService.chat(message, history, 'normal');
      historyService.addMessage(userId, 'assistant', response);
      await _sendLong(ctx, response, 'normal');
    }
  } catch (error) {
    await _handleCmdError(ctx, error, 'memproses pesan');
  }
}

// ============================================
// /MODE
// ============================================
export function handleMode(ctx) {
  const userId = ctx.from.id;
  const mode = ctx.message.text.replace(/^\/mode\s*/i, '').trim().toLowerCase();
  const validModes = ['normal', 'code', 'debug', 'review', 'explain'];

  if (mode && validModes.includes(mode)) {
    historyService.setMode(userId, mode);
    const modeNames = {
      normal: '💬 Chat Biasa',
      code: '⚡ Generate Kode',
      debug: '🐛 Debugging',
      review: '🔍 Code Review',
      explain: '📖 Penjelasan Kode',
    };
    return ctx.replyWithMarkdown(`✅ *Mode aktif:* ${modeNames[mode]}`, afterResponseKeyboard(mode));
  }

  const currentMode = historyService.getMode(userId);
  return ctx.replyWithMarkdown(`🔄 *Pilih Mode*\n\nMode saat ini: \`${currentMode}\``, modeKeyboard(currentMode));
}

// ============================================
// /CLEAR — Clear history AND memory
// ============================================
export function handleClear(ctx) {
  const userId = ctx.from.id;
  historyService.clearHistory(userId);
  return ctx.replyWithMarkdown(
    '🗑️ *Riwayat dihapus.*\n\nPercakapan baru dimulai.\n\n_💡 Memory preferensi kamu tetap disimpan. Ketik /memory untuk lihat/atur._',
    mainMenuKeyboard(premiumService.isPremium(userId))
  );
}

// ============================================
// /STATS — Bot statistics
// ============================================
export function handleStats(ctx) {
  const userId = ctx.from.id;
  const activeConversations = historyService.getActiveCount();
  const remaining = rateLimitService.getRemaining(userId);
  const currentMode = historyService.getMode(userId);
  const history = historyService.getHistory(userId);
  const isPremium = premiumService.isPremium(userId);
  const tierStats = premiumService.getStats(userId);

  const modeNames = {
    normal: '💬 Chat Biasa',
    code: '⚡ Generate Kode',
    debug: '🐛 Debugging',
    review: '🔍 Code Review',
    explain: '📖 Penjelasan Kode',
  };

  let statsMessage = `
✨ *Statistik Glo Agent*
━━━━━━━━━━━━━━━━━━━━

🔄 Mode aktif      : *${modeNames[currentMode] || currentMode}*
💬 Chat aktif       : *${activeConversations}*
📝 Pesan di riwayat : *${history.length}*
⚡ Sisa rate limit  : *${remaining}/min*
👤 User ID          : \`${userId}\`
💎 Tier             : *${isPremium ? 'Premium' : 'Free'}*
`;

  if (!isPremium) {
    statsMessage += `
*Daily Quota:*
💬 Messages  : ${tierStats.messages.used}/${tierStats.messages.limit}
🖼️ Vision    : ${tierStats.vision.used}/${tierStats.vision.limit}
🔍 Search    : ${tierStats.search.used}/${tierStats.search.limit}
🎤 Voice ASR : ${tierStats.voiceASR.used}/${tierStats.voiceASR.limit}
`;
  }

  return ctx.replyWithMarkdown(statsMessage, statsKeyboard());
}

// ============================================
// /MYSTATS — alias for /stats
// ============================================
export const handleMyStats = handleStats;

// ============================================
// /TIER — show premium status
// ============================================
export function handleTier(ctx) {
  const userId = ctx.from.id;
  const msg = premiumService.formatStatsMessage(userId);
  return ctx.replyWithMarkdown(msg, backHomeKeyboard());
}

// ============================================
// /MEMORY — show & manage long-term memory
// ============================================
export function handleMemory(ctx) {
  const userId = ctx.from.id;
  const mem = memoryService.get(userId);

  let msg = `
🧠 *Long-Term Memory*
━━━━━━━━━━━━━━━━━━━━

`;

  if (!mem) {
    msg += '_Belum ada memori tersimpan._\n\n';
    msg += 'Bot akan otomatis belajar preferensi kamu dari chat. Contoh:\n';
    msg += '• "Nama saya Andi"\n';
    msg += '• "Saya pakai Next.js"\n';
    msg += '• "Ingat bahwa project saya pake PostgreSQL"\n';
    msg += '• "Saya pemula React"\n';
  } else {
    if (mem.preferences && Object.keys(mem.preferences).length > 0) {
      msg += '*Preferensi:*\n';
      for (const [k, v] of Object.entries(mem.preferences)) {
        msg += `• ${k}: ${typeof v === 'number' ? new Date(v).toLocaleDateString() : v}\n`;
      }
      msg += '\n';
    }
    if (mem.facts && mem.facts.length > 0) {
      msg += `*Facts (${mem.facts.length}):*\n`;
      mem.facts.slice(-10).forEach((f, i) => {
        msg += `${i + 1}. ${f.content}\n`;
      });
    } else {
      msg += '_Belum ada facts tersimpan._\n';
    }
  }

  msg += '\n_💡 Ketik `/clear` untuk reset riwayat chat. Memory tetap aman._';

  return ctx.replyWithMarkdown(msg, backHomeKeyboard());
}

// ============================================
// /SEARCH — Web search command
// ============================================
export async function handleSearch(ctx) {
  const userId = ctx.from.id;
  const query = ctx.message.text.replace(/^\/search\s*/i, '').trim();

  if (!query) {
    return ctx.replyWithMarkdown(
      '🌐 *Web Search*\n\nKetik query pencarian:\n• `/search harga Bitcoin hari ini`\n• `/search React 19 release notes`\n• `/search cara deploy Next.js ke Vercel`\n\n_Atau cukup ketik "cari ..." atau "search ..." di chat_',
      backHomeKeyboard()
    );
  }

  const rateCheck = rateLimitService.checkLimit(userId);
  if (!rateCheck.allowed) {
    return ctx.reply(`⏳ Tunggu *${rateCheck.retryAfter}s* sebelum request lagi.`, { parse_mode: 'Markdown' });
  }

  const quota = premiumService.checkAndIncrement(userId, 'search');
  if (!quota.allowed) {
    return ctx.replyWithMarkdown(`🆓 *Kuota search harian habis* (${quota.limit}/hari).\n\n💎 Upgrade Premium untuk unlimited.`);
  }

  await ctx.replyWithChatAction('typing');

  try {
    const results = await webSearchService.search(query, 5);
    if (results.length === 0) {
      return ctx.replyWithMarkdown(`🔍 Tidak ada hasil untuk: \`${query}\``, backHomeKeyboard());
    }
    const msg = webSearchService.formatResults(query, results);
    await ctx.replyWithMarkdown(msg, backHomeKeyboard());

    // Auto-summarize with AI
    await ctx.replyWithMarkdown('🤖 _Sedang rangkum hasil dengan AI..._');
    const summary = await webSearchService.searchAndSummarize(query, aiService, 3);
    historyService.addMessage(userId, 'user', `[SEARCH] ${query}`);
    historyService.addMessage(userId, 'assistant', summary);
    await _sendLong(ctx, summary, 'normal');
  } catch (error) {
    await _handleCmdError(ctx, error, 'melakukan web search');
  }
}

// ============================================
// /IMAGE — Vision helper
// ============================================
export function handleImage(ctx) {
  return ctx.replyWithMarkdown(
    '🖼️ *Vision / Image Analysis*\n\n' +
    'Cara pakai:\n' +
    '• *Kirim foto langsung* ke chat ini (dengan caption sebagai prompt)\n' +
    '• *Kirim file gambar* (.jpg, .png, .webp)\n' +
    '• Bot otomatis analisa gambar dengan AI vision\n\n' +
    '*Contoh:*\n' +
    '• Screenshot error → "tolong debug ini"\n' +
    '• Foto mockup design → "kodekan HTML/CSS ini"\n' +
    '• Foto kode di whiteboard → "transkrip & jelaskan"\n' +
    '• Screenshot UI → "review UX design ini"',
    backHomeKeyboard()
  );
}

// ============================================
// /VOICE — Voice input helper
// ============================================
export function handleVoice(ctx) {
  const userId = ctx.from.id;
  const available = voiceService.isASRAvailable();

  let msg = `
🎤 *Voice Input*
━━━━━━━━━━━━━━━━━━━━

Status: ${available ? '✅ *Aktif*' : '❌ *Belum aktif*'}

`;

  if (available) {
    msg += 'Cara pakai:\n';
    msg += '• *Tahan tombol mic* di Telegram → rekam suara → kirim\n';
    msg += '• Bot akan transkripsi voice kamu ke teks\n';
    msg += '• Teks langsung diproses AI sesuai mode aktif\n\n';
    msg += '_Tip: bicara jelas, hindari noise background_';
  } else {
    msg += 'Voice input butuh provider dengan Whisper support.\n\n';
    msg += '*Setup (gratis):*\n';
    msg += '1. Set `AI_PROVIDER=groq` di Railway\n';
    msg += '2. Set `AI_API_KEY=gsk_...` (dari https://console.groq.com)\n';
    msg += '3. Redeploy\n';
    msg += '4. Coba lagi';
  }

  return ctx.replyWithMarkdown(msg, backHomeKeyboard());
}

// ============================================
// /TTS — Text-to-Speech
// ============================================
export async function handleTTS(ctx) {
  const userId = ctx.from.id;
  const text = ctx.message.text.replace(/^\/tts\s*/i, '').trim();

  if (!text) {
    return ctx.replyWithMarkdown(
      '🔊 *Text-to-Speech*\n\nKetik teks yang ingin diubah ke suara:\n• `/tts Halo, saya Glo Agent`\n• `/tts Hello world, this is a test`\n\n_Note: TTS butuh Z.ai SDK (otomatis aktif di infra Z.ai)_',
      backHomeKeyboard()
    );
  }

  const quota = premiumService.checkAndIncrement(userId, 'voiceTTS');
  if (!quota.allowed) {
    return ctx.replyWithMarkdown(
      `🆓 *TTS cuma untuk Premium user.*\n\n` +
      `💎 Upgrade Premium untuk aktifkan TTS.\n\n` +
      `Set \`PREMIUM_USER_IDS\` di Railway dengan ID kamu: \`${userId}\``
    );
  }

  await ctx.replyWithChatAction('record_voice');

  try {
    const result = await voiceService.synthesize(text);
    if (!result) {
      return ctx.replyWithMarkdown(
        '⚠️ *TTS tidak tersedia di environment ini.*\n\n' +
        'TTS butuh Z.ai SDK infrastructure. Untuk TTS eksternal, set PROVIDER=openai dan OPENAI_API_KEY.'
      );
    }
    await ctx.replyWithVoice(
      { source: result.buffer, filename: 'glo-tts.mp3' },
      { caption: `🔊 ${text.substring(0, 100)}` }
    );
  } catch (error) {
    await _handleCmdError(ctx, error, 'generate voice');
  }
}

// ============================================
// /AISTATUS — Diagnostic
// ============================================
export async function handleAiStatus(ctx) {
  try {
    await ctx.replyWithChatAction('typing');

    if (!aiService.initialized) {
      await aiService.initialize();
    }

    const status = aiService.getStatus();

    let msg = `
✨ *AI Service Status — Glo Agent*
━━━━━━━━━━━━━━━━━━━━

✅ Initialized  : *${status.initialized ? 'YES ✓' : 'NO ✗'}*
🌐 Provider     : *${status.provider || '(none)'}*
🌍 Base URL     : \`${status.baseUrl || '-'}\`
🤖 Model        : \`${status.model || '-'}\`
👁️ Vision Model : \`${status.visionModel || '-'}\`
⚡ Fast Model   : \`${status.fastModel || '-'}\`
🔑 API Key      : *${status.hasApiKey ? 'SET ✓' : 'MISSING ✗'}*
🔑 Key (masked) : \`${status.apiKeyMasked}\`
🔑 Key length   : *${status.apiKeyLength} chars*

*Environment variables:*
• \`AI_PROVIDER=${status.envProvider}\`
• \`AI_MODEL=${status.envModel}\`
• \`AI_BASE_URL=${status.envBaseUrl}\`
• \`AI_VISION_MODEL=${status.envVisionModel}\`
• \`AI_FAST_MODEL=${status.envFastModel}\`
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
      return ctx.replyWithMarkdown(msg, backHomeKeyboard());
    }

    msg += `\n🧪 *Testing connection...*`;
    await ctx.replyWithMarkdown(msg);

    const test = await aiService.testConnection();
    const sanitize = (s) => String(s ?? '').replace(/[`*_\[\]]/g, '').substring(0, 400);

    const testMsg = test.ok
      ? `✅ *Test connection: BERHASIL*\n\n📡 Model: \`${sanitize(test.model)}\`\n💬 Response: \`${sanitize(test.message)}\``
      : `❌ *Test connection: GAGAL*\n\n📡 Model: \`${sanitize(test.model)}\`\n❗ Error: \`${sanitize(test.message)}\`\n\n*Possible causes:*\n• API key salah/expired\n• Model tidak tersedia di akun\n• Rate limit terkena\n• Network issue`;

    try {
      return await ctx.replyWithMarkdown(testMsg, backHomeKeyboard());
    } catch (mdErr) {
      const plain = testMsg.replace(/\*/g, '').replace(/`/g, '').replace(/_/g, '');
      return ctx.reply(plain, backHomeKeyboard());
    }
  } catch (error) {
    console.error('AiStatus command error:', error);
    try {
      const errMsg = String(error.message || error).replace(/[`*_\[\]]/g, '').substring(0, 200);
      return await ctx.replyWithMarkdown(`❌ *Gagal cek status AI.*\n\n*Error:* \`${errMsg}\``, backHomeKeyboard());
    } catch (mdErr) {
      return ctx.reply(`❌ Gagal cek status AI.\n\nError: ${String(error.message || error).substring(0, 300)}`, backHomeKeyboard());
    }
  }
}

// ============================================
// /run — execute code in Piston sandbox (no API key, free)
// Usage:
//   /run python
//   print("hello")
//   ^D
// OR:
//   /run python print(1+1)
// OR:
//   Reply /run to a code message
// ============================================

export async function handleRun(ctx) {
  const userId = ctx.from?.id;
  const args = ctx.message?.text?.replace(/^\/run\s*/i, '').trim();
  const reply = ctx.message?.reply_to_message;

  try {
    // Check premium quota (sandbox is a premium-tier feature for safety)
    const quota = premiumService.check(userId, 'sandbox');
    if (!quota.ok) {
      return ctx.replyWithMarkdown(
        `⚠️ *Kuota sandbox harian habis.* (${quota.used}/${quota.limit})\n\n` +
        `Upgrade ke premium untuk eksekusi tanpa batas.`,
        backHomeKeyboard()
      );
    }

    // Determine source of code
    let code = '';
    let language = '';

    if (reply && reply.text) {
      // Reply to a code message
      code = reply.text;
      language = args || '';
    } else if (args) {
      // Inline: /run python <code...>
      // First word = language, rest = code
      const firstSpace = args.indexOf('\n') >= 0 ? args.indexOf('\n') : args.indexOf(' ');
      if (firstSpace > 0) {
        language = args.substring(0, firstSpace).trim();
        code = args.substring(firstSpace + 1).trim();
      } else {
        // Single token — treat as language with no code, show help
        language = args;
      }
    }

    if (!code) {
      const help =
        `💻 *Cara pakai /run:*\n\n` +
        `*Format 1 — Inline:*\n` +
        `\`/run python\nprint("hello")\`\n\n` +
        `*Format 2 — Reply ke pesan kode:*\n` +
        `Reply pesan berisi kode lalu ketik \`/run js\`\n\n` +
        `*Bahasa yang didukung:*\n` +
        `\`python\`, \`javascript\`, \`typescript\`, \`go\`, \`rust\`, \`c\`, \`c++\`, \`java\`, \`ruby\`, \`php\`, \`bash\`, \`lua\`, \`perl\`, \`haskell\`, \`swift\`, \`kotlin\`, \`sql\`\n\n` +
        `*Contoh:*\n` +
        `\`/run python\nfor i in range(5):\n    print(f"i={i}")\``;
      return ctx.replyWithMarkdown(help, backHomeKeyboard());
    }

    await ctx.replyWithMarkdown(`⏳ *Menjalankan kode...* \`${language || 'auto-detect'}\``);

    const result = await sandboxService.runCode(code, { language: language || undefined });

    // Increment usage (only if call succeeded in reaching sandbox)
    premiumService.incrementUsage(userId, 'sandbox');

    if (!result.ok && result.error && result.error.includes('Bahasa tidak dikenali')) {
      return ctx.replyWithMarkdown(
        `❌ *${result.error}*\n\n${sandboxService.getSupportedLanguagesList()}`,
        backHomeKeyboard()
      );
    }

    const formatted = sandboxService.formatResult(result);
    return ctx.replyWithMarkdown(formatted, backHomeKeyboard());
  } catch (error) {
    console.error('Run command error:', error);
    return _handleCmdError(ctx, error, 'run code');
  }
}

// ============================================
// /ask — premium chat with autonomous tool calling (run_code + web_search)
// The AI decides on its own whether to execute code or search the web.
// ============================================

export async function handleAsk(ctx) {
  const userId = ctx.from?.id;
  const question = ctx.message?.text?.replace(/^\/ask\s*/i, '').trim();

  if (!question) {
    return ctx.replyWithMarkdown(
      `🤖 *Cara pakai /ask:*\n\n` +
      `\`/ask hitung fibonacci ke-20 pakai python\`\n` +
      `\`/ask berapa harga Bitcoin sekarang?\`\n` +
      `\`/ask buat function JS untuk cek palindrome lalu test\`\n\n` +
      `_AI akan otomatis panggil tools (run_code, web_search) sesuai kebutuhan._`,
      backHomeKeyboard()
    );
  }

  try {
    // Premium-only feature
    const quota = premiumService.check(userId, 'tool_chat');
    if (!quota.ok) {
      return ctx.replyWithMarkdown(
        `⚠️ *Kuota /ask harian habis.* (${quota.used}/${quota.limit})\n\n` +
        `Upgrade ke premium untuk pakai AI agent dengan tools tanpa batas.`,
        backHomeKeyboard()
      );
    }

    await ctx.replyWithMarkdown('🤔 *Berpikir... mungkin manggil tools*');

    const history = historyService.getHistory(userId);
    const { content, toolHistory } = await aiService.chatWithTools(question, history, 'normal');
    historyService.addMessage(userId, 'user', question);
    historyService.addMessage(userId, 'assistant', content);
    premiumService.incrementUsage(userId, 'tool_chat');

    // If tools were called, prepend a small badge
    let finalText = content;
    if (toolHistory && toolHistory.length > 0) {
      const toolBadges = toolHistory
        .map(t => t.name === 'run_code' ? `💻 run_code(${t.args.language || 'auto'})` : `🔍 web_search("${t.args.query || ''}")`)
        .join('  •  ');
      finalText = `_Tools dipakai: ${toolBadges}_\n\n${content}`;
    }

    return _sendLong(ctx, finalText, 'normal');
  } catch (error) {
    console.error('Ask command error:', error);
    return _handleCmdError(ctx, error, 'ask with tools');
  }
}

// ============================================
// Helpers
// ============================================

async function _sendLong(ctx, text, mode) {
  const parts = splitMessage(text, 3900);
  for (let i = 0; i < parts.length; i++) {
    const isLast = i === parts.length - 1;
    try {
      if (isLast) {
        await ctx.replyWithMarkdown(parts[i], afterResponseKeyboard(mode));
      } else {
        await ctx.replyWithMarkdown(parts[i]);
      }
    } catch (mdErr) {
      // Fallback plain
      const plain = parts[i].replace(/[*_`~\[\]]/g, '');
      if (isLast) {
        await ctx.reply(plain, afterResponseKeyboard(mode));
      } else {
        await ctx.reply(plain);
      }
    }
  }
}

async function _handleCmdError(ctx, error, action) {
  console.error(`Command error (${action}):`, error);
  const errMsg = String(error.message || error).substring(0, 300);
  try {
    await ctx.replyWithMarkdown(
      `❌ *Gagal ${action}.*\n\n*Detail:* \`${errMsg}\`\n\n*Cek konfigurasi:* ketik /aistatus`,
      backHomeKeyboard()
    );
  } catch (mdErr) {
    await ctx.reply(`❌ Gagal ${action}. Detail: ${errMsg}`, backHomeKeyboard());
  }
}
