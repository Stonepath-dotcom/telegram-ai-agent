import aiService from '../services/ai.service.js';
import historyService from '../services/history.service.js';
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
 * Handle callback queries from inline buttons
 * Professional button navigation system
 */
export async function handleCallbackQuery(ctx) {
  const userId = ctx.from.id;
  const data = ctx.callbackQuery.data;

  try {
    // ============================================
    // MODE SELECTION
    // ============================================
    if (data.startsWith('mode_')) {
      const mode = data.replace('mode_', '');
      const validModes = ['normal', 'code', 'debug', 'review', 'explain'];

      if (!validModes.includes(mode)) {
        return ctx.answerCbQuery('❌ Mode tidak valid');
      }

      historyService.setMode(userId, mode);

      const modeNames = {
        normal: '💬 Chat Biasa',
        code: '🧑‍💻 Generate Kode',
        debug: '🐛 Debugging',
        review: '🔍 Code Review',
        explain: '📖 Penjelasan Kode',
      };

      await ctx.answerCbQuery(`✅ ${modeNames[mode]}`);

      await ctx.editMessageText(
        `✅ *Mode aktif: ${modeNames[mode]}*\n\n` +
        (mode === 'normal' ? 'Ketik pesan apa saja untuk chat.' :
         mode === 'code' ? 'Ketik deskripsi kode yang ingin dibuat.\nContoh: `buat REST API Express.js`' :
         mode === 'debug' ? 'Kirim kode yang bermasalah.\nTambahkan `| ERROR: pesan` jika ada error.' :
         mode === 'review' ? 'Kirim kode yang ingin direview.' :
         'Kirim kode yang ingin dijelaskan.'),
        {
          parse_mode: 'Markdown',
          ...afterResponseKeyboard(mode),
        }
      );
      return;
    }

    // ============================================
    // QUICK ACTIONS (from main menu)
    // ============================================
    if (data === 'quick_code') {
      await ctx.answerCbQuery('');
      await ctx.editMessageText(
        '🧑‍💻 *Generate Kode*\n\nKetik deskripsi kode yang ingin dibuat, atau pilih bahasa dulu:',
        { parse_mode: 'Markdown', ...languageSelectKeyboard() }
      );
      historyService.setMode(userId, 'code');
      return;
    }

    if (data === 'quick_debug') {
      await ctx.answerCbQuery('');
      await ctx.editMessageText(
        '🐛 *Debug Kode*\n\nKirim kode yang bermasalah.\n\n*Format:*\n• Langsung paste kode\n• `kode | ERROR: pesan error`',
        { parse_mode: 'Markdown', ...backHomeKeyboard() }
      );
      historyService.setMode(userId, 'debug');
      return;
    }

    if (data === 'quick_review') {
      await ctx.answerCbQuery('');
      await ctx.editMessageText(
        '🔍 *Code Review*\n\nKirim kode yang ingin direview.\nSaya akan analisis kualitas, keamanan, dan performa.',
        { parse_mode: 'Markdown', ...backHomeKeyboard() }
      );
      historyService.setMode(userId, 'review');
      return;
    }

    if (data === 'quick_explain') {
      await ctx.answerCbQuery('');
      await ctx.editMessageText(
        '📖 *Jelaskan Kode*\n\nKirim kode yang ingin dijelaskan.\nSaya akan break down step-by-step.',
        { parse_mode: 'Markdown', ...backHomeKeyboard() }
      );
      historyService.setMode(userId, 'explain');
      return;
    }

    // ============================================
    // LANGUAGE SELECTION (for code generation)
    // ============================================
    if (data.startsWith('lang_')) {
      const lang = data.replace('lang_', '');

      if (lang === 'other') {
        await ctx.answerCbQuery('');
        await ctx.editMessageText(
          '🧑‍💻 *Generate Kode*\n\nKetik bahasa dan deskripsi:\n`/code <bahasa> <deskripsi>`\n\n*Contoh:*\n• `/code Swift iOS login screen`\n• `/code Kotlin Android RecyclerView`\n• `/code SQL query for sales report`',
          { parse_mode: 'Markdown', ...backHomeKeyboard() }
        );
        return;
      }

      const langNames = {
        python: '🐍 Python',
        javascript: '🟨 JavaScript',
        rust: '🦀 Rust',
        go: '🐹 Go',
        java: '☕ Java',
        typescript: '⚛️ TypeScript',
        ruby: '💎 Ruby',
        php: '🐘 PHP',
        cpp: '⚡ C++',
        csharp: '🔵 C#',
      };

      await ctx.answerCbQuery('');
      await ctx.editMessageText(
        `${langNames[lang] || lang} *dipilih!*\n\nKetik deskripsi kode ${langNames[lang] || lang} yang ingin dibuat:\n\n*Contoh:*\n\`/code ${lang} REST API dengan authentication\``,
        { parse_mode: 'Markdown', ...backHomeKeyboard() }
      );
      historyService.setMode(userId, 'code');
      return;
    }

    // ============================================
    // SHOW MODES
    // ============================================
    if (data === 'show_modes') {
      const currentMode = historyService.getMode(userId);
      await ctx.answerCbQuery('');
      await ctx.editMessageText(
        '🔄 *Pilih Mode*\n\nPilih mode percakapan yang sesuai kebutuhan:',
        { parse_mode: 'Markdown', ...modeKeyboard(currentMode) }
      );
      return;
    }

    // ============================================
    // SHOW STATS
    // ============================================
    if (data === 'show_stats') {
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

      await ctx.answerCbQuery('');

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
      await ctx.editMessageText(statsMessage, {
        parse_mode: 'Markdown',
        ...statsKeyboard(),
      });
      return;
    }

    // ============================================
    // CLEAR HISTORY
    // ============================================
    if (data === 'clear_history') {
      historyService.clearHistory(userId);
      await ctx.answerCbQuery('🗑️ Riwayat dihapus!');
      await ctx.editMessageText(
        '🗑️ *Riwayat dihapus!*\n\nPercakapan baru dimulai.',
        { parse_mode: 'Markdown', ...mainMenuKeyboard() }
      );
      return;
    }

    // ============================================
    // BACK HOME
    // ============================================
    if (data === 'back_home') {
      const userName = ctx.from.first_name || 'Friend';
      await ctx.answerCbQuery('');
      await ctx.editMessageText(
        `👋 *Halo, ${userName}!*\n\nSaya *AI Coding Agent* — asisten coding pintar yang siap bantu kamu _menulis, review, debug,_ dan _jelaskan_ kode.\n\n*⚡ Pilih fitur:*`,
        { parse_mode: 'Markdown', ...mainMenuKeyboard() }
      );
      return;
    }

    // ============================================
    // HELP PAGES
    // ============================================
    if (data === 'help_code') {
      await ctx.answerCbQuery('');
      await ctx.editMessageText(
        '🧑‍💻 *Generate Kode — Panduan*\n\n' +
        'Ketik `/code` diikuti deskripsi kode:\n' +
        '• `/code buat REST API Express.js`\n' +
        '• `/code Python web scraper`\n' +
        '• `/code React login component`\n\n' +
        '*Tips:*\n' +
        '• Semakin detail deskripsi, semakin akurat hasilnya\n' +
        '• Bisa sebutkan framework/library spesifik\n' +
        '• Bot otomatis tambah error handling & comments',
        { parse_mode: 'Markdown', ...helpKeyboard() }
      );
      return;
    }

    if (data === 'help_debug') {
      await ctx.answerCbQuery('');
      await ctx.editMessageText(
        '🐛 *Debug Kode — Panduan*\n\n' +
        'Kirim kode yang error:\n' +
        '• `/debug <paste kode>`\n' +
        '• `/debug <kode> | ERROR: <pesan>`\n\n' +
        '*Tips:*\n' +
        '• Sertakan pesan error untuk hasil lebih akurat\n' +
        '• Bisa kirim screenshot error sebagai text\n' +
        '• Bot akan jelaskan root cause + fix',
        { parse_mode: 'Markdown', ...helpKeyboard() }
      );
      return;
    }

    if (data === 'help_review') {
      await ctx.answerCbQuery('');
      await ctx.editMessageText(
        '🔍 *Code Review — Panduan*\n\n' +
        'Kirim kode yang ingin direview:\n' +
        '• `/review <paste kode>`\n' +
        '• Atau langsung paste kode tanpa command\n\n' +
        '*Yang dianalisis:*\n' +
        '🟢 Kelebihan kode\n' +
        '🟡 Area yang bisa ditingkatkan\n' +
        '🔴 Masalah yang harus diperbaiki\n' +
        '🛡️ Keamanan & vulnerability\n' +
        '⚡ Performa',
        { parse_mode: 'Markdown', ...helpKeyboard() }
      );
      return;
    }

    if (data === 'help_explain') {
      await ctx.answerCbQuery('');
      await ctx.editMessageText(
        '📖 *Explain Kode — Panduan*\n\n' +
        'Kirim kode yang ingin dijelaskan:\n' +
        '• `/explain <paste kode>`\n\n' +
        '*Yang akan kamu dapatkan:*\n' +
        '• Overview singkat apa yang dilakukan kode\n' +
        '• Breakdown step-by-step\n' +
        '• Penjelasan logic yang kompleks\n' +
        '• Analogi untuk mempermudah pemahaman\n\n' +
        'Cocok untuk belajar kode baru! 🎓',
        { parse_mode: 'Markdown', ...helpKeyboard() }
      );
      return;
    }

    if (data === 'help_chat') {
      await ctx.answerCbQuery('');
      await ctx.editMessageText(
        '💬 *Chat Mode — Panduan*\n\n' +
        'Mode chat untuk diskusi bebas tentang:\n' +
        '• Arsitektur & design pattern\n' +
        '• Best practices\n' +
        '• Perbandingan teknologi\n' +
        '• Tips & trick programming\n' +
        '• Tanya jawab konsep CS\n\n' +
        'Langsung ketik pesan, gak perlu command!\n' +
        'Bot mengingat konteks percakapan. 🧠',
        { parse_mode: 'Markdown', ...helpKeyboard() }
      );
      return;
    }

    // ============================================
    // NOOP (for display-only buttons)
    // ============================================
    if (data === 'noop') {
      await ctx.answerCbQuery('');
      return;
    }

    // ============================================
    // CANCEL
    // ============================================
    if (data === 'cancel_action') {
      await ctx.answerCbQuery('Dibatalkan');
      await ctx.editMessageText(
        '❌ Aksi dibatalkan.',
        { parse_mode: 'Markdown', ...mainMenuKeyboard() }
      );
      return;
    }

    // ============================================
    // DEFAULT
    // ============================================
    await ctx.answerCbQuery('❓ Aksi tidak dikenal');

  } catch (error) {
    // Handle "query is too old" errors gracefully
    const isTimeoutError = error?.description?.includes('too old') ||
                           error?.description?.includes('timeout expired') ||
                           error?.message?.includes('too old');
    
    if (isTimeoutError) {
      console.warn('⚠️ Callback query expired (user clicked old button) - ignoring');
      try {
        await ctx.answerCbQuery('⏰ Tombol sudah kedaluwarsa. Coba lagi.').catch(() => {});
      } catch (e) { /* ignore */ }
      return;
    }

    console.error('Callback query error:', error.message || error);
    try {
      await ctx.answerCbQuery('⚠️ Terjadi kesalahan').catch(() => {});
    } catch (e) { /* ignore */ }
  }
}
