import aiService from '../services/ai.service.js';
import historyService from '../services/history.service.js';
import premiumService from '../services/premium.service.js';
import memoryService from '../services/memory.service.js';
import webSearchService from '../services/web-search.service.js';
import rateLimitService from '../services/rate-limit.service.js';
import voiceService from '../services/voice.service.js';
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
 * Handle callback queries from inline buttons — Premium Edition
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
        code: '⚡ Generate Kode',
        debug: '🐛 Debugging',
        review: '🔍 Code Review',
        explain: '📖 Penjelasan Kode',
      };

      await ctx.answerCbQuery(`✅ ${modeNames[mode]}`);

      const msgText =
        `✅ *Mode aktif: ${modeNames[mode]}*\n\n` +
        (mode === 'normal' ? 'Ketik pesan apa saja untuk chat.' :
         mode === 'code' ? 'Ketik deskripsi kode yang ingin dibuat.\nContoh: `buat REST API Express.js`' :
         mode === 'debug' ? 'Kirim kode yang bermasalah.\nTambahkan `| ERROR: pesan` jika ada error.' :
         mode === 'review' ? 'Kirim kode yang ingin direview.' :
         'Kirim kode yang ingin dijelaskan.');

      try {
        await ctx.editMessageText(msgText, { parse_mode: 'Markdown', ...afterResponseKeyboard(mode) });
      } catch (mdErr) {
        await ctx.editMessageText(msgText.replace(/[*_`~\[\]]/g, ''), afterResponseKeyboard(mode));
      }
      return;
    }

    // ============================================
    // QUICK ACTIONS
    // ============================================
    if (data === 'quick_code') {
      await ctx.answerCbQuery('');
      await ctx.editMessageText(
        '⚡ *Generate Kode*\n\nKetik deskripsi kode yang ingin dibuat, atau pilih bahasa dulu:',
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

    if (data === 'quick_image') {
      await ctx.answerCbQuery('');
      await ctx.editMessageText(
        '🖼️ *Analisa Gambar*\n\nCara pakai:\n' +
        '• Kirim *foto* langsung (dengan caption sebagai prompt)\n' +
        '• Kirim *file gambar* (.jpg, .png, .webp)\n' +
        '• Bot otomatis analisa dengan AI vision\n\n' +
        '*Contoh:*\n' +
        '• Screenshot error → "debug ini"\n' +
        '• Foto mockup → "kodekan HTML/CSS"\n' +
        '• Foto kode whiteboard → "transkrip"',
        { parse_mode: 'Markdown', ...backHomeKeyboard() }
      );
      return;
    }

    if (data === 'quick_search') {
      await ctx.answerCbQuery('');
      await ctx.editMessageText(
        '🌐 *Web Search*\n\nCara pakai:\n' +
        '• Ketik `/search <query>`\n' +
        '• Atau ketik langsung "cari ..." atau "search ..."\n\n' +
        '*Contoh:*\n' +
        '• `cari harga Bitcoin hari ini`\n' +
        '• `search Next.js 15 features`\n' +
        '• `/search cara deploy ke Railway`',
        { parse_mode: 'Markdown', ...backHomeKeyboard() }
      );
      return;
    }

    if (data === 'quick_run') {
      await ctx.answerCbQuery('');
      await ctx.editMessageText(
        '💻 *Run Kode di Sandbox*\n\n' +
        'Jalankan kode langsung di sandbox Judge0 CE (free, 30+ bahasa).\n\n' +
        '*Cara pakai:*\n' +
        '• `/run python\\nprint("hello")`\n' +
        '• `/run js console.log(1+1)`\n' +
        '• Reply pesan kode lalu ketik `/run python`\n\n' +
        '*Atau natural language:*\n' +
        '• `run kode ini:` (lalu paste kode di code block)\n' +
        '• `test kode\\n```python\\nprint(42)\\n```\n\n' +
        '*Bahasa: * `python` `javascript` `typescript` `go` `rust` `c` `c++` `java` `ruby` `php` `bash` `sql`',
        { parse_mode: 'Markdown', ...backHomeKeyboard() }
      );
      return;
    }

    if (data === 'quick_ask') {
      await ctx.answerCbQuery('');
      await ctx.editMessageText(
        '🤖 *Ask dengan Tools Otonom*\n\n' +
        'AI agent yang bisa *otomatis* panggil tools:\n' +
        '• 💻 `run_code` — eksekusi kode di sandbox\n' +
        '• 🔍 `web_search` — cari info real-time di web\n\n' +
        '*Contoh:*\n' +
        '• `/ask hitung fibonacci ke-30 pakai python`\n' +
        '• `/ask berapa harga Bitcoin sekarang?`\n' +
        '• `/ask buat function JS cek palindrome, lalu test`\n' +
        '• `/ask berapa populasi Indonesia tahun 2024?`\n\n' +
        'AI akan *memilih sendiri* tool mana yang dipakai, eksekusi, lalu kasih jawaban final.',
        { parse_mode: 'Markdown', ...backHomeKeyboard() }
      );
      return;
    }

    if (data === 'quick_voice_help') {
      await ctx.answerCbQuery('');
      const available = voiceService.isASRAvailable();
      let msg = '🎤 *Voice Input*\n\n';
      msg += `Status: ${available ? '✅ Aktif' : '❌ Belum aktif'}\n\n`;
      if (available) {
        msg += 'Cara pakai:\n• Tahan tombol mic di Telegram\n• Rekam suara, lalu kirim\n• Bot auto-transcribe & proses';
      } else {
        msg += 'Setup:\n• Set `AI_PROVIDER=groq` di Railway\n• Set `AI_API_KEY=gsk_...`\n• Redeploy';
      }
      try {
        await ctx.editMessageText(msg, { parse_mode: 'Markdown', ...backHomeKeyboard() });
      } catch (mdErr) {
        await ctx.editMessageText(msg.replace(/[*_`~\[\]]/g, ''), backHomeKeyboard());
      }
      return;
    }

    // ============================================
    // LANGUAGE SELECTION
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
        typescript: '🔷 TypeScript',
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

      await ctx.answerCbQuery('');
      try {
        await ctx.editMessageText(statsMessage, { parse_mode: 'Markdown', ...statsKeyboard() });
      } catch (mdErr) {
        await ctx.editMessageText(statsMessage.replace(/[*_`~\[\]]/g, ''), statsKeyboard());
      }
      return;
    }

    // ============================================
    // SHOW TIER
    // ============================================
    if (data === 'show_tier') {
      await ctx.answerCbQuery('');
      const msg = premiumService.formatStatsMessage(userId);
      try {
        await ctx.editMessageText(msg, { parse_mode: 'Markdown', ...backHomeKeyboard() });
      } catch (mdErr) {
        await ctx.editMessageText(msg.replace(/[*_`~\[\]]/g, ''), backHomeKeyboard());
      }
      return;
    }

    // ============================================
    // SHOW MEMORY
    // ============================================
    if (data === 'show_memory') {
      await ctx.answerCbQuery('');
      const mem = memoryService.get(userId);
      let msg = '🧠 *Long-Term Memory*\n━━━━━━━━━━━━━━━━━━━━\n\n';

      if (!mem || (Object.keys(mem.preferences || {}).length === 0 && (!mem.facts || mem.facts.length === 0))) {
        msg += '_Belum ada memori tersimpan._\n\n';
        msg += 'Bot akan otomatis belajar preferensi kamu dari chat:\n';
        msg += '• "Nama saya Andi"\n• "Saya pakai Next.js"\n• "Ingat bahwa project saya pake PostgreSQL"';
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
        }
      }

      try {
        await ctx.editMessageText(msg, { parse_mode: 'Markdown', ...backHomeKeyboard() });
      } catch (mdErr) {
        await ctx.editMessageText(msg.replace(/[*_`~\[\]]/g, ''), backHomeKeyboard());
      }
      return;
    }

    // ============================================
    // SHOW HELP
    // ============================================
    if (data === 'show_help') {
      await ctx.answerCbQuery('');
      try {
        await ctx.editMessageText(
          '✨ *Panduan Glo Agent*\n━━━━━━━━━━━━━━━━━━━━\n\n' +
          '⚡ `/code` — Generate kode\n' +
          '🐛 `/debug` — Debug kode\n' +
          '🔍 `/review` — Review kode\n' +
          '📖 `/explain` — Jelaskan kode\n' +
          '💬 `/chat` — Chat bebas\n' +
          '🖼️ `/image` — Analisa gambar\n' +
          '🌐 `/search` — Web search\n' +
          '🎤 `/voice` — Voice input\n' +
          '🔊 `/tts` — Text-to-speech\n' +
          '🧠 `/memory` — Lihat memori\n' +
          '📊 `/mystats` — Statistik\n' +
          '💎 `/tier` — Cek tier\n' +
          '🔍 `/aistatus` — Diagnostik AI\n\n' +
          'Pilih kategori untuk panduan detail:',
          { parse_mode: 'Markdown', ...helpKeyboard() }
        );
      } catch (mdErr) {
        await ctx.editMessageText(
          '✨ Panduan Glo Agent\n\nGunakan: /code /debug /review /explain /chat /image /search /voice /tts /memory /mystats /tier /aistatus',
          helpKeyboard()
        );
      }
      return;
    }

    // ============================================
    // SEARCH SUMMARY (from inline button after search)
    // ============================================
    if (data.startsWith('search_summary_')) {
      const encoded = data.replace('search_summary_', '');
      try {
        const query = Buffer.from(encoded, 'base64').toString('utf8');
        await ctx.answerCbQuery('🤖 Membuat rangkuman...');

        await ctx.replyWithChatAction('typing');
        const summary = await webSearchService.searchAndSummarize(query, aiService, 3);
        historyService.addMessage(userId, 'user', `[SEARCH] ${query}`);
        historyService.addMessage(userId, 'assistant', summary);
        try {
          await ctx.replyWithMarkdown(summary, afterResponseKeyboard('normal'));
        } catch (mdErr) {
          await ctx.reply(summary.replace(/[*_`~\[\]]/g, ''), afterResponseKeyboard('normal'));
        }
      } catch (e) {
        await ctx.answerCbQuery('⚠️ Gagal rangkum');
      }
      return;
    }

    // ============================================
    // CLEAR HISTORY
    // ============================================
    if (data === 'clear_history') {
      historyService.clearHistory(userId);
      await ctx.answerCbQuery('🗑️ Riwayat dihapus');
      try {
        await ctx.editMessageText(
          '🗑️ *Riwayat dihapus.*\n\nPercakapan baru dimulai.\n\n_💡 Memory preferensi tetap aman. Ketik /memory untuk lihat._',
          { parse_mode: 'Markdown', ...mainMenuKeyboard(premiumService.isPremium(userId)) }
        );
      } catch (mdErr) {
        await ctx.editMessageText(
          '🗑️ Riwayat dihapus. Percakapan baru dimulai.',
          mainMenuKeyboard(premiumService.isPremium(userId))
        );
      }
      return;
    }

    // ============================================
    // BACK HOME
    // ============================================
    if (data === 'back_home') {
      const userName = ctx.from.first_name || 'Friend';
      const isPremium = premiumService.isPremium(userId);
      const welcomeMessage = `
✨ *G L O   A G E N T*  ${isPremium ? '💎' : '🆓'}
━━━━━━━━━━━━━━━━━━━━

Halo, *${userName}* 👋

Saya *Glo* — partner coding premium kamu. Saya bisa nulis, telaah, debug, dan jelaskan kode. Plus sekarang saya punya mata 👁️, telinga 🎤, dan akses internet 🌐.

*Status:* ${isPremium ? '💎 Premium (unlimited)' : '🆓 Free tier'}

Pilih fitur di bawah 👇
`;
      await ctx.answerCbQuery('');
      try {
        await ctx.editMessageText(welcomeMessage, { parse_mode: 'Markdown', ...mainMenuKeyboard(isPremium) });
      } catch (mdErr) {
        await ctx.editMessageText(welcomeMessage.replace(/[*_`~\[\]]/g, ''), mainMenuKeyboard(isPremium));
      }
      return;
    }

    // ============================================
    // HELP PAGES
    // ============================================
    const helpPages = {
      help_code: ['⚡ *Generate Kode — Panduan*\n\nKetik `/code` diikuti deskripsi kode:\n• `/code buat REST API Express.js`\n• `/code Python web scraper`\n• `/code React login component`\n\n*Tips:*\n• Semakin detail deskripsi, semakin akurat hasilnya\n• Bisa sebutkan framework/library spesifik\n• Bot otomatis tambah error handling & comments'],
      help_debug: ['🐛 *Debug Kode — Panduan*\n\nKirim kode yang error:\n• `/debug <paste kode>`\n• `/debug <kode> | ERROR: <pesan>`\n\n*Tips:*\n• Sertakan pesan error untuk hasil lebih akurat\n• Bisa kirim screenshot error sebagai text\n• Bot akan jelaskan root cause + fix'],
      help_review: ['🔍 *Code Review — Panduan*\n\nKirim kode yang ingin direview:\n• `/review <paste kode>`\n• Atau langsung paste kode tanpa command\n\n*Yang dianalisis:*\n🟢 Kelebihan kode\n🟡 Area yang bisa ditingkatkan\n🔴 Masalah yang harus diperbaiki\n🛡️ Keamanan & vulnerability\n⚡ Performa'],
      help_explain: ['📖 *Explain Kode — Panduan*\n\nKirim kode yang ingin dijelaskan:\n• `/explain <paste kode>`\n\n*Yang akan kamu dapatkan:*\n• Overview singkat apa yang dilakukan kode\n• Breakdown step-by-step\n• Penjelasan logic yang kompleks\n• Analogi untuk mempermudah pemahaman\n\nCocok untuk belajar kode baru.'],
      help_image: ['🖼️ *Vision / Image Analysis — Panduan*\n\nCara pakai:\n• Kirim *foto* langsung ke chat (dengan caption sebagai prompt)\n• Kirim *file gambar* (.jpg, .png, .webp)\n• Bot otomatis analisa dengan AI vision\n\n*Contoh:*\n• Screenshot error → "tolong debug ini"\n• Foto mockup design → "kodekan HTML/CSS ini"\n• Foto kode di whiteboard → "transkrip & jelaskan"\n• Screenshot UI → "review UX design ini"\n\n_Kuota free: 5 gambar/hari. Premium: unlimited._'],
      help_search: ['🌐 *Web Search — Panduan*\n\nCara pakai:\n• `/search <query>`\n• Atau ketik langsung "cari ..." / "search ..."\n\n*Contoh:*\n• `cari harga Bitcoin hari ini`\n• `search Next.js 15 features`\n• `/search cara deploy ke Railway`\n\n*Hasil:*\n1. List 5 hasil pencarian (judul, snippet, URL)\n2. Rangkuman AI dari hasil pencarian\n\n_Kuota free: 10 search/hari. Premium: unlimited._'],
      help_voice: ['🎤 *Voice Input — Panduan*\n\nCara pakai:\n• Tahan tombol mic di Telegram\n• Rekam suara, lalu kirim\n• Bot auto-transcribe via Groq Whisper\n• Teks langsung diproses AI sesuai mode aktif\n\n*Butuh:*\n• `AI_PROVIDER=groq` di Railway\n• `AI_API_KEY` valid\n\n_Kuota free: 5 voice/hari. Premium: unlimited._'],
      help_memory: ['🧠 *Long-Term Memory — Panduan*\n\nBot otomatis belajar preferensi kamu dari chat:\n• "Nama saya Andi" → disimpan\n• "Saya pakai Next.js" → disimpan\n• "Ingat bahwa project saya pake PostgreSQL" → disimpan\n• "Saya pemula React" → disimpan\n\nMemory dipakai AI untuk:\n• Personalisasi jawaban\n• Ingat konteks antar session\n• Saran sesuai stack kamu\n\n*Kelola:*\n• `/memory` — lihat memori\n• `/clear` — reset riwayat chat (memory tetap)'],
    };

    if (helpPages[data]) {
      await ctx.answerCbQuery('');
      try {
        await ctx.editMessageText(helpPages[data][0], { parse_mode: 'Markdown', ...helpKeyboard() });
      } catch (mdErr) {
        await ctx.editMessageText(helpPages[data][0].replace(/[*_`~\[\]]/g, ''), helpKeyboard());
      }
      return;
    }

    // ============================================
    // NOOP (display-only buttons)
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
      await ctx.editMessageText('❌ Aksi dibatalkan.', { parse_mode: 'Markdown', ...mainMenuKeyboard(premiumService.isPremium(userId)) });
      return;
    }

    // ============================================
    // DEFAULT
    // ============================================
    await ctx.answerCbQuery('❓ Aksi tidak dikenal');

  } catch (error) {
    const isTimeoutError = error?.description?.includes('too old') ||
                           error?.description?.includes('timeout expired') ||
                           error?.message?.includes('too old');

    if (isTimeoutError) {
      console.warn('⚠️ Callback query expired - ignoring');
      try { await ctx.answerCbQuery('⏰ Tombol sudah kedaluwarsa. Coba lagi.').catch(() => {}); } catch (e) {}
      return;
    }

    console.error('Callback query error:', error.message || error);
    try { await ctx.answerCbQuery('⚠️ Terjadi kesalahan').catch(() => {}); } catch (e) {}
  }
}

/**
 * Inline mode handler — @bot query
 * Lets users invoke the bot from any chat via @GloAgentBot <query>
 */
export async function handleInlineQuery(ctx) {
  const query = ctx.inlineQuery?.query?.trim() || '';

  // Empty query → show hint results
  if (!query) {
    return ctx.answerInlineQuery([
      {
        id: 'hint-code',
        type: 'article',
        title: '⚡ Generate Kode — ketik deskripsi',
        description: 'Contoh: @GloAgentBot buat REST API Express',
        input_message_content: {
          message_text: '⚡ Ketik `/code <deskripsi>` untuk generate kode',
          parse_mode: 'Markdown',
        },
      },
      {
        id: 'hint-search',
        type: 'article',
        title: '🌐 Web Search — ketik query',
        description: 'Contoh: @GloAgentBot cari harga Bitcoin',
        input_message_content: {
          message_text: '🌐 Ketik `/search <query>` di private chat',
          parse_mode: 'Markdown',
        },
      },
      {
        id: 'hint-chat',
        type: 'article',
        title: '💬 Tanya AI — ketik pertanyaan',
        description: 'Contoh: @GloAgentBot apa itu React hooks?',
        input_message_content: {
          message_text: '💬 Buka private chat untuk tanya AI',
        },
      },
    ], { cache_time: 60 });
  }

  // Detect intent from query
  const lowerQuery = query.toLowerCase();
  let results = [];

  // Quick AI chat result
  try {
    // For inline, do a quick non-streaming chat with no history
    const response = await aiService.chat(query, [], 'normal');
    const preview = (response || '').substring(0, 3000);

    results.push({
      id: `chat-${Date.now()}`,
      type: 'article',
      title: `💬 Glo: ${query.substring(0, 60)}`,
      description: preview.substring(0, 100) + '...',
      input_message_content: {
        message_text: `❓ *${query.substring(0, 200)}*\n\n${preview}`,
        parse_mode: 'Markdown',
      },
    });
  } catch (e) {
    results.push({
      id: 'error',
      type: 'article',
      title: '⚠️ AI sedang offline',
      description: `Error: ${e.message.substring(0, 80)}`,
      input_message_content: {
        message_text: `⚠️ AI service offline. Coba lagi nanti.`,
      },
    });
  }

  return ctx.answerInlineQuery(results, { cache_time: 5 });
}
