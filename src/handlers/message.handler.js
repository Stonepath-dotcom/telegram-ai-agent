import aiService from '../services/ai.service.js';
import historyService from '../services/history.service.js';
import rateLimitService from '../services/rate-limit.service.js';
import memoryService from '../services/memory.service.js';
import premiumService from '../services/premium.service.js';
import fileService from '../services/file.service.js';
import voiceService from '../services/voice.service.js';
import webSearchService from '../services/web-search.service.js';
import sandboxService from '../services/sandbox.service.js';
import { splitMessage } from '../utils/formatter.js';
import { afterResponseKeyboard } from '../utils/keyboards.js';

// Telegram message char limit is 4096. We use 3900 to leave room for safety.
const MAX_MSG = 3900;
// Streaming: edit message at most every 1.2s to avoid Telegram rate limit (429)
const STREAM_EDIT_INTERVAL_MS = 1200;

/**
 * Handle regular text messages (non-command)
 * Auto-detects code, image attachments, voice notes, and premium gating.
 */
export async function handleMessage(ctx) {
  const userId = ctx.from.id;
  const text = ctx.message?.text;

  if (!text) return;

  // Rate limit (anti-spam, separate from premium quota)
  const rateCheck = rateLimitService.checkLimit(userId);
  if (!rateCheck.allowed) {
    return ctx.reply(`⏳ Tunggu *${rateCheck.retryAfter}s* sebelum request lagi.`, { parse_mode: 'Markdown' });
  }

  // Premium quota check
  const quota = premiumService.checkAndIncrement(userId, 'messages');
  if (!quota.allowed) {
    return ctx.replyWithMarkdown(
      `🆓 *Kuota harian habis.*\n\n` +
      `Kamu udah pakai ${quota.limit} pesan hari ini.\n\n` +
      `💎 *Upgrade Premium* untuk unlimited:\n` +
      `• Set env var \`PREMIUM_USER_IDS\` di Railway dengan ID kamu: \`${userId}\`\n` +
      `• Atau hubungi admin\n\n` +
      `_Kuota reset tiap hari UTC_`
    );
  }

  // Memory: detect & store preferences/facts from message
  try {
    memoryService.detectAndStoreFromMessage(userId, text);
  } catch (e) {
    console.warn(`Memory detect failed: ${e.message}`);
  }

  // Auto-detect web search trigger
  // "search xxx", "cari xxx", "google xxx", "berita terbaru", "harga ... sekarang"
  const searchTrigger = /^(search|cari|google|bing)\s+(.{3,200})$/i.exec(text)
    || /^(berita|news)\s+(terbaru|hari ini|latest)?\s*(.{3,100})$/i.exec(text)
    || /^(harga|price|kurs)\s+(\w+)\s+(sekarang|hari ini|today)?$/i.exec(text);

  if (searchTrigger) {
    const query = searchTrigger[2] || searchTrigger[3] || text;
    return _handleSearch(ctx, userId, query);
  }

  // Auto-detect "run this code" / "test code ini" trigger
  // Phrases: "jalankan kode ini", "run this", "eksekusi ...", "coba run", "test kode", "execute ..."
  // Must contain a code block (```...```) OR be a reply to a code-looking message.
  const runTrigger = /^(?:jalankan|run|eksekusi|coba\s+run|test\s+kode|execute|coba\s+kode)\b/i.test(text);
  if (runTrigger && detectCode(text)) {
    return _handleRunInline(ctx, userId, text);
  }

  await ctx.replyWithChatAction('typing');

  try {
    const mode = historyService.getMode(userId);
    const hasCode = detectCode(text);
    const history = historyService.getHistory(userId);

    // Inject memory context into history (so AI "remembers" user)
    const memoryContext = memoryService.buildMemoryContext(userId);

    historyService.addMessage(userId, 'user', text);

    // Choose processing path
    let response;
    if (mode === 'code') {
      response = await aiService.generateCode(text, '', history);
    } else if (mode === 'debug') {
      response = await aiService.debugCode(text, '', history);
    } else if (mode === 'review') {
      response = await aiService.reviewCode(text, history);
    } else if (mode === 'explain') {
      response = await aiService.explainCode(text, history);
    } else if (hasCode) {
      response = await aiService.chat(text, history, 'normal');
    } else {
      response = await aiService.chat(text, history, 'normal');
    }

    historyService.addMessage(userId, 'assistant', response);

    await _sendLongReply(ctx, response, mode);
  } catch (error) {
    await _handleError(ctx, error);
  }
}

/**
 * Handle photo messages — auto-analyze with AI vision
 */
export async function handlePhoto(ctx) {
  const userId = ctx.from.id;

  const rateCheck = rateLimitService.checkLimit(userId);
  if (!rateCheck.allowed) {
    return ctx.reply(`⏳ Tunggu *${rateCheck.retryAfter}s* sebelum request lagi.`, { parse_mode: 'Markdown' });
  }

  const quota = premiumService.checkAndIncrement(userId, 'vision');
  if (!quota.allowed) {
    return ctx.replyWithMarkdown(
      `🆓 *Kuota vision harian habis* (${quota.limit} gambar/hari).\n\n` +
      `💎 Upgrade Premium untuk unlimited vision.`
    );
  }

  await ctx.replyWithChatAction('typing');

  try {
    // Get the largest photo
    const photos = ctx.message.photo;
    const largest = photos[photos.length - 1];

    // Get caption as prompt (or default)
    const prompt = ctx.message.caption || 'Analyze this image. If it contains code, errors, or UI screenshots, describe and explain them.';

    const response = await fileService.processImage(
      ctx.telegram,
      { file_id: largest.file_id, file_name: 'photo.jpg', mime_type: 'image/jpeg' },
      prompt,
      historyService.getHistory(userId)
    );

    historyService.addMessage(userId, 'user', `[IMAGE] ${prompt}`);
    historyService.addMessage(userId, 'assistant', response);

    await _sendLongReply(ctx, response, 'normal');
  } catch (error) {
    console.error('Photo handler error:', error);
    await _handleError(ctx, error);
  }
}

/**
 * Handle voice messages — auto-transcribe via Groq Whisper, then process as text
 */
export async function handleVoice(ctx) {
  const userId = ctx.from.id;

  const rateCheck = rateLimitService.checkLimit(userId);
  if (!rateCheck.allowed) {
    return ctx.reply(`⏳ Tunggu *${rateCheck.retryAfter}s* sebelum request lagi.`, { parse_mode: 'Markdown' });
  }

  if (!voiceService.isASRAvailable()) {
    return ctx.replyWithMarkdown(
      `🎤 *Voice input belum aktif.*\n\n` +
      `Voice transcription butuh provider dengan Whisper support (Groq/OpenAI).\n\n` +
      `*Setup:*\n` +
      `• Set \`AI_PROVIDER=groq\` di Railway\n` +
      `• Pastikan \`AI_API_KEY\` sudah benar\n\n` +
      `Daftar gratis: https://console.groq.com/keys`
    );
  }

  const quota = premiumService.checkAndIncrement(userId, 'voiceASR');
  if (!quota.allowed) {
    return ctx.replyWithMarkdown(
      `🆓 *Kuota voice ASR harian habis* (${quota.limit} voice/hari).\n\n` +
      `💎 Upgrade Premium untuk unlimited.`
    );
  }

  await ctx.replyWithChatAction('typing');

  try {
    const voiceMeta = {
      file_id: ctx.message.voice.file_id,
      duration: ctx.message.voice.duration,
      mime_type: ctx.message.voice.mime_type,
      file_size: ctx.message.voice.file_size,
    };

    const result = await voiceService.transcribe(ctx.telegram, voiceMeta);

    if (!result.text || result.text.trim().length === 0) {
      return ctx.reply('🎤 *Transkripsi kosong* — tidak ada suara terdeteksi.', { parse_mode: 'Markdown' });
    }

    // Show transcription to user (so they can verify)
    const transcribedText = result.text.trim();
    const langInfo = result.language ? ` (${result.language})` : '';
    await ctx.replyWithMarkdown(
      `🎤 *Transkripsi${langInfo}:*\n\n"${_escapeMd(transcribedText)}"\n\n_— Sedang diproses AI..._`
    );

    // Now process as regular message
    historyService.addMessage(userId, 'user', `[VOICE] ${transcribedText}`);

    await ctx.replyWithChatAction('typing');

    const mode = historyService.getMode(userId);
    const history = historyService.getHistory(userId);
    let response;

    if (mode === 'code') {
      response = await aiService.generateCode(transcribedText, '', history);
    } else if (mode === 'debug') {
      response = await aiService.debugCode(transcribedText, '', history);
    } else if (mode === 'review') {
      response = await aiService.reviewCode(transcribedText, history);
    } else if (mode === 'explain') {
      response = await aiService.explainCode(transcribedText, history);
    } else {
      response = await aiService.chat(transcribedText, history, 'normal');
    }

    historyService.addMessage(userId, 'assistant', response);
    await _sendLongReply(ctx, response, mode);
  } catch (error) {
    console.error('Voice handler error:', error);
    await _handleError(ctx, error);
  }
}

/**
 * Handle document/file messages — text or image
 */
export async function handleDocument(ctx) {
  const userId = ctx.from.id;

  const rateCheck = rateLimitService.checkLimit(userId);
  if (!rateCheck.allowed) {
    return ctx.reply(`⏳ Tunggu *${rateCheck.retryAfter}s* sebelum request lagi.`, { parse_mode: 'Markdown' });
  }

  const file = ctx.message.document;
  const fileName = file.file_name || 'unknown';
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const isImage = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)
    || (file.mime_type || '').startsWith('image/');

  // Vision quota for image, message quota for text
  const quota = premiumService.checkAndIncrement(userId, isImage ? 'vision' : 'messages');
  if (!quota.allowed) {
    return ctx.replyWithMarkdown(
      `🆓 *Kuota ${isImage ? 'vision' : 'messages'} harian habis.*\n\n` +
      `💎 Upgrade Premium untuk unlimited.`
    );
  }

  await ctx.replyWithChatAction('typing');

  try {
    const mode = historyService.getMode(userId);
    const history = historyService.getHistory(userId);

    let response;
    if (isImage) {
      const prompt = ctx.message.caption || `Analyze this image (${fileName}). Describe what you see, identify any code, errors, or UI elements.`;
      response = await fileService.processImage(
        ctx.telegram,
        { file_id: file.file_id, file_name: fileName, mime_type: file.mime_type || 'image/jpeg' },
        prompt,
        history
      );
      historyService.addMessage(userId, 'user', `[IMAGE: ${fileName}] ${prompt}`);
    } else {
      const result = await fileService.processTextFile(
        ctx.telegram,
        { file_id: file.file_id, file_name: fileName, mime_type: file.mime_type },
        mode,
        history
      );
      response = result.response;
      historyService.addMessage(userId, 'user', `[FILE: ${fileName}]`);
    }

    historyService.addMessage(userId, 'assistant', response);
    await _sendLongReply(ctx, response, mode);
  } catch (error) {
    console.error('Document handler error:', error);
    await _handleError(ctx, error);
  }
}

// ============================================
// Helpers
// ============================================

async function _handleSearch(ctx, userId, query) {
  const quota = premiumService.checkAndIncrement(userId, 'search');
  if (!quota.allowed) {
    return ctx.replyWithMarkdown(
      `🆓 *Kuota search harian habis* (${quota.limit}/hari).\n\n💎 Upgrade Premium untuk unlimited.`
    );
  }

  await ctx.replyWithChatAction('typing');

  try {
    const results = await webSearchService.search(query, 5);
    const msg = webSearchService.formatResults(query, results);
    await ctx.replyWithMarkdown(msg);

    // Ask if user wants AI summary
    await ctx.replyWithMarkdown(
      '🤖 *Mau rangkuman AI dari hasil ini?*',
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Ya, rangkum', callback_data: `search_summary_${Buffer.from(query).toString('base64').substring(0, 60)}` },
              { text: '❌ Tidak', callback_data: 'noop' },
            ],
          ],
        },
      }
    );
  } catch (error) {
    console.error('Search handler error:', error);
    await _handleError(ctx, error);
  }
}

/**
 * Extract code from message text and execute it in sandbox.
 * Looks for ```lang\n...code...``` blocks. If found, runs the first block.
 * Otherwise, treats the entire message after the trigger word as code.
 */
async function _handleRunInline(ctx, userId, text) {
  const quota = premiumService.check(userId, 'sandbox');
  if (!quota.ok) {
    return ctx.replyWithMarkdown(
      `🆓 *Kuota sandbox harian habis* (${quota.used}/${quota.limit}).\n\n` +
      `💎 Upgrade Premium untuk unlimited.`
    );
  }

  await ctx.replyWithChatAction('typing');

  try {
    // Extract first ```lang\n...``` code block
    const codeBlockMatch = text.match(/```(\w+)?\n([\s\S]+?)```/);
    let code = '';
    let language = '';

    if (codeBlockMatch) {
      language = codeBlockMatch[1] || '';
      code = codeBlockMatch[2];
    } else {
      // No fenced block — strip trigger word and use rest as code
      const stripped = text.replace(/^(?:jalankan|run|eksekusi|coba\s+run|test\s+kode|execute|coba\s+kode)\s*/i, '');
      // First token might be language
      const m = stripped.match(/^(\w+)\s+([\s\S]+)$/);
      if (m && m[1].length <= 12) {
        language = m[1];
        code = m[2];
      } else {
        code = stripped;
      }
    }

    if (!code || !code.trim()) {
      return ctx.replyWithMarkdown('⚠️ Tidak ada kode yang ditemukan untuk dijalankan.');
    }

    await ctx.replyWithMarkdown(`⏳ *Menjalankan kode...* \`${language || 'auto-detect'}\``);

    const result = await sandboxService.runCode(code, { language: language || undefined });
    premiumService.incrementUsage(userId, 'sandbox');

    const formatted = sandboxService.formatResult(result);
    await ctx.replyWithMarkdown(formatted, afterResponseKeyboard('normal'));
  } catch (error) {
    console.error('Inline run handler error:', error);
    await _handleError(ctx, error);
  }
}

async function _sendLongReply(ctx, text, mode) {
  const parts = splitMessage(text, MAX_MSG);
  for (let i = 0; i < parts.length; i++) {
    if (i === parts.length - 1) {
      try {
        await ctx.replyWithMarkdown(parts[i], afterResponseKeyboard(mode));
      } catch (mdErr) {
        // Markdown parse failed — fallback plain
        console.warn('Markdown send failed, plain fallback:', mdErr.message);
        await ctx.reply(parts[i].replace(/[*_`~\[\]]/g, ''), afterResponseKeyboard(mode));
      }
    } else {
      try {
        await ctx.replyWithMarkdown(parts[i]);
      } catch (mdErr) {
        await ctx.reply(parts[i].replace(/[*_`~\[\]]/g, ''));
      }
    }
  }
}

async function _handleError(ctx, error) {
  console.error('Message handler error:', error);
  const errMsg = String(error.message || error);

  if (errMsg.includes('AI service is not configured') || errMsg.includes('AI_API_KEY') || errMsg.includes('AUTH FAILED')) {
    await ctx.replyWithMarkdown(
      '⚠️ *AI service belum dikonfigurasi atau API key invalid*\n\n' +
      '*Detail:* `' + errMsg.substring(0, 200) + '`\n\n' +
      '*Cara setup (gratis via Groq):*\n' +
      '1. Daftar di https://console.groq.com\n' +
      '2. Buat API key gratis\n' +
      '3. Set env var di Railway:\n' +
      '   • `AI_PROVIDER=groq`\n' +
      '   • `AI_API_KEY=gsk_...`\n' +
      '4. Redeploy service\n\n' +
      'Cek status: ketik `/aistatus`'
    );
  } else if (errMsg.includes('fetch failed') || errMsg.includes('Connect Timeout') || errMsg.includes('timeout')) {
    await ctx.replyWithMarkdown(
      '⚠️ *AI service timeout*\n\n' +
      'Koneksi ke provider terlalu lama. Coba lagi sebentar.\n\n' +
      `*Detail:* \`${errMsg.substring(0, 150)}\``
    );
  } else {
    await ctx.replyWithMarkdown(
      `❌ *Gagal memproses pesan.*\n\n` +
      `*Detail:* \`${errMsg.substring(0, 250)}\`\n\n` +
      `*Cek konfigurasi:* ketik /aistatus`
    );
  }
}

function _escapeMd(s) {
  return String(s || '').replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

function detectCode(text) {
  const codeIndicators = [
    /```[\s\S]*?```/,
    /function\s+\w+\s*\(/,
    /const\s+\w+\s*=/,
    /import\s+.*from/,
    /class\s+\w+/,
    /def\s+\w+\s*\(/,
    /public\s+static\s+void/,
    /fn\s+\w+\s*\(/,
    /func\s+\w+\s*\(/,
    /#include\s*</,
    /<\w+>.*<\/\w+>/,
    /\{\s*\n.*:\s*.*/,
    /console\.log/,
    /print\s*\(/,
    /return\s+/,
    /\w+\s*=>\s*\{/,
  ];
  return codeIndicators.some(regex => regex.test(text));
}
