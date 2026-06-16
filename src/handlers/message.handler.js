import aiService from '../services/ai.service.js';
import historyService from '../services/history.service.js';
import rateLimitService from '../services/rate-limit.service.js';
import { splitMessage } from '../utils/formatter.js';
import { afterResponseKeyboard } from '../utils/keyboards.js';

/**
 * Handle regular text messages (non-command)
 * Automatically detects if message contains code
 */
export async function handleMessage(ctx) {
  const userId = ctx.from.id;
  const text = ctx.message.text;

  if (!text) return;

  // Check rate limit
  const rateCheck = rateLimitService.checkLimit(userId);
  if (!rateCheck.allowed) {
    return ctx.reply(`⏳ Tunggu *${rateCheck.retryAfter}s* sebelum request lagi.`, { parse_mode: 'Markdown' });
  }

  await ctx.replyWithChatAction('typing');

  try {
    // Get current mode
    const mode = historyService.getMode(userId);

    // Auto-detect if message contains code
    const hasCode = detectCode(text);

    // Save user message to history
    historyService.addMessage(userId, 'user', text);

    // Determine how to process the message
    let response;

    if (mode === 'code') {
      response = await aiService.generateCode(text, '', historyService.getHistory(userId));
    } else if (mode === 'debug') {
      response = await aiService.debugCode(text, '', historyService.getHistory(userId));
    } else if (mode === 'review') {
      response = await aiService.reviewCode(text, historyService.getHistory(userId));
    } else if (mode === 'explain') {
      response = await aiService.explainCode(text, historyService.getHistory(userId));
    } else if (hasCode) {
      // Auto-review if user sends code in normal mode
      response = await aiService.chat(text, historyService.getHistory(userId), 'normal');
    } else {
      // Normal chat
      response = await aiService.chat(text, historyService.getHistory(userId), 'normal');
    }

    // Save AI response to history
    historyService.addMessage(userId, 'assistant', response);

    // Send response with action keyboard on last part
    const parts = splitMessage(response);
    for (let i = 0; i < parts.length; i++) {
      if (i === parts.length - 1) {
        await ctx.replyWithMarkdown(parts[i], afterResponseKeyboard(mode));
      } else {
        await ctx.replyWithMarkdown(parts[i]);
      }
    }
  } catch (error) {
    console.error('Message handler error:', error);
    const errMsg = error.message || '';
    if (errMsg.includes('AI service is not configured') || errMsg.includes('AI_API_KEY')) {
      await ctx.replyWithMarkdown(
        '⚠️ *AI service belum dikonfigurasi*\n\n' +
        'Bot admin perlu set API key dulu.\n\n' +
        '*Cara setup (gratis):*\n' +
        '1. Daftar di https://console.groq.com\n' +
        '2. Buat API key gratis\n' +
        '3. Set env var: `AI_PROVIDER=groq` dan `AI_API_KEY=...`\n\n' +
        'Setelah itu bot bisa dipake lagi.'
      );
    } else if (errMsg.includes('fetch failed') || errMsg.includes('Connect Timeout')) {
      await ctx.reply('⚠️ AI service lagi bermasalah (koneksi timeout). Coba lagi sebentar.');
    } else {
      await ctx.reply(`❌ Gagal memproses pesan: ${errMsg.substring(0, 100)}`);
    }
  }
}

/**
 * Handle document/file messages - extract code from files
 */
export async function handleDocument(ctx) {
  const userId = ctx.from.id;

  const rateCheck = rateLimitService.checkLimit(userId);
  if (!rateCheck.allowed) {
    return ctx.reply(`⏳ Tunggu *${rateCheck.retryAfter}s* sebelum request lagi.`, { parse_mode: 'Markdown' });
  }

  await ctx.replyWithChatAction('typing');

  try {
    const file = ctx.message.document;
    const fileName = file.file_name || 'unknown';
    const fileId = file.file_id;

    // Get file link
    const fileLink = await ctx.telegram.getFileLink(fileId);

    // Fetch file content
    const response = await fetch(fileLink.href);
    const content = await response.text();

    // Truncate if too long
    const maxContentLength = 10000;
    const truncatedContent = content.length > maxContentLength
      ? content.substring(0, maxContentLength) + '\n... (truncated)'
      : content;

    // Get current mode
    const mode = historyService.getMode(userId);

    historyService.addMessage(userId, 'user', `[FILE: ${fileName}]\n${truncatedContent}`);

    let aiResponse;

    if (mode === 'debug') {
      aiResponse = await aiService.debugCode(truncatedContent, '', historyService.getHistory(userId));
    } else if (mode === 'review') {
      aiResponse = await aiService.reviewCode(truncatedContent, historyService.getHistory(userId));
    } else if (mode === 'explain') {
      aiResponse = await aiService.explainCode(truncatedContent, historyService.getHistory(userId));
    } else {
      // Default: review the code file
      aiResponse = await aiService.reviewCode(truncatedContent, historyService.getHistory(userId));
    }

    historyService.addMessage(userId, 'assistant', aiResponse);

    const parts = splitMessage(aiResponse);
    for (let i = 0; i < parts.length; i++) {
      if (i === parts.length - 1) {
        await ctx.replyWithMarkdown(parts[i], afterResponseKeyboard(mode));
      } else {
        await ctx.replyWithMarkdown(parts[i]);
      }
    }
  } catch (error) {
    console.error('Document handler error:', error);
    await ctx.reply('❌ Gagal memproses file. Pastikan file berisi teks/kode.');
  }
}

/**
 * Detect if a message likely contains code
 * @param {string} text - Message text
 * @returns {boolean}
 */
function detectCode(text) {
  const codeIndicators = [
    /```[\s\S]*?```/,           // Markdown code blocks
    /function\s+\w+\s*\(/,      // function declarations
    /const\s+\w+\s*=/,          // const declarations
    /import\s+.*from/,           // import statements
    /class\s+\w+/,               // class declarations
    /def\s+\w+\s*\(/,           // Python function
    /public\s+static\s+void/,   // Java main method
    /fn\s+\w+\s*\(/,            // Rust function
    /func\s+\w+\s*\(/,          // Go function
    /#include\s*</,              // C/C++ include
    /<\w+>.*<\/\w+>/,           // HTML tags
    /\{\s*\n.*:\s*.*/,          // JSON-like
    /console\.log/,             // JS console
    /print\s*\(/,               // Python print
    /return\s+/,                // return statement
    /\w+\s*=>\s*\{/,            // Arrow functions
  ];

  return codeIndicators.some(regex => regex.test(text));
}
