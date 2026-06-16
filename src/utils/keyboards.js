import { Markup } from 'telegraf';

/**
 * Glo Agent — Keyboard Builder (Premium Edition)
 *
 * Premium button layout with:
 * - Quick action chips for code/debug/review/explain
 * - New feature buttons: vision, search, voice
 * - Premium tier badge
 */

// ============================================
// MODE SELECTION — ✅ marks active mode
// ============================================
export function modeKeyboard(currentMode = 'normal') {
  const modes = [
    { id: 'normal',  label: '💬 Chat'    },
    { id: 'code',    label: '⚡ Code'     },
    { id: 'debug',   label: '🐛 Debug'   },
    { id: 'review',  label: '🔍 Review'  },
    { id: 'explain', label: '📖 Explain' },
  ];

  const buttons = modes.map(m => {
    const isActive = m.id === currentMode;
    const text = isActive ? `✅ ${m.label}` : m.label;
    return Markup.button.callback(text, `mode_${m.id}`);
  });

  return Markup.inlineKeyboard([
    [buttons[0], buttons[1]],
    [buttons[2], buttons[3]],
    [buttons[4]],
    [Markup.button.callback('🏠 Menu Utama', 'back_home')],
  ]);
}

// ============================================
// MAIN MENU — premium landing with new feature buttons
// ============================================
export function mainMenuKeyboard(isPremium = false) {
  const premiumBadge = isPremium ? '💎' : '🆓';
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('⚡ Generate Kode', 'quick_code'),
      Markup.button.callback('🐛 Debug Kode',    'quick_debug'),
    ],
    [
      Markup.button.callback('🔍 Review Kode',   'quick_review'),
      Markup.button.callback('📖 Jelaskan Kode', 'quick_explain'),
    ],
    [
      Markup.button.callback('🖼️ Analisa Gambar', 'quick_image'),
      Markup.button.callback('🌐 Web Search',     'quick_search'),
    ],
    [
      Markup.button.callback('💻 Run Kode',        'quick_run'),
      Markup.button.callback('🤖 Ask + Tools',     'quick_ask'),
    ],
    [
      Markup.button.callback('🎤 Voice Input',     'quick_voice_help'),
      Markup.button.callback('📊 Statistik',       'show_stats'),
    ],
    [
      Markup.button.callback('🧠 Memory',         'show_memory'),
      Markup.button.callback(`${premiumBadge} Tier`, 'show_tier'),
    ],
    [
      Markup.button.callback('🗑️ Hapus Riwayat', 'clear_history'),
      Markup.button.callback('❓ Bantuan',        'show_help'),
    ],
  ]);
}

// ============================================
// AFTER RESPONSE — shown under AI replies
// ============================================
export function afterResponseKeyboard(currentMode) {
  const modeLabels = {
    normal:  '💬 Chat',
    code:    '⚡ Code',
    debug:   '🐛 Debug',
    review:  '🔍 Review',
    explain: '📖 Explain',
  };

  return Markup.inlineKeyboard([
    [
      Markup.button.callback('🔄 Ganti Mode', 'show_modes'),
      Markup.button.callback(`✅ ${modeLabels[currentMode] || '💬 Chat'}`, 'noop'),
    ],
    [
      Markup.button.callback('🗑️ Hapus Riwayat', 'clear_history'),
      Markup.button.callback('📊 Statistik',      'show_stats'),
    ],
  ]);
}

// ============================================
// CONFIRM
// ============================================
export function confirmKeyboard(action, confirmText = '✅ Ya', cancelText = '❌ Batal') {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(confirmText, `confirm_${action}`),
      Markup.button.callback(cancelText,  'cancel_action'),
    ],
  ]);
}

// ============================================
// HELP NAVIGATION
// ============================================
export function helpKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('⚡ Code',    'help_code'),
      Markup.button.callback('🐛 Debug',   'help_debug'),
    ],
    [
      Markup.button.callback('🔍 Review',  'help_review'),
      Markup.button.callback('📖 Explain', 'help_explain'),
    ],
    [
      Markup.button.callback('🖼️ Vision',  'help_image'),
      Markup.button.callback('🌐 Search',  'help_search'),
    ],
    [
      Markup.button.callback('🎤 Voice',   'help_voice'),
      Markup.button.callback('🧠 Memory',  'help_memory'),
    ],
    [
      Markup.button.callback('🏠 Menu Utama', 'back_home'),
    ],
  ]);
}

// ============================================
// STATS — refresh + home
// ============================================
export function statsKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('🔄 Refresh',    'show_stats'),
      Markup.button.callback('🏠 Menu Utama', 'back_home'),
    ],
  ]);
}

// ============================================
// BACK HOME — single button
// ============================================
export function backHomeKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🏠 Menu Utama', 'back_home')],
  ]);
}

// ============================================
// LANGUAGE SELECT — clean language picker
// ============================================
export function languageSelectKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('🐍 Python',     'lang_python'),
      Markup.button.callback('🟨 JavaScript', 'lang_javascript'),
    ],
    [
      Markup.button.callback('🦀 Rust',       'lang_rust'),
      Markup.button.callback('🐹 Go',         'lang_go'),
    ],
    [
      Markup.button.callback('☕ Java',       'lang_java'),
      Markup.button.callback('🔷 TypeScript', 'lang_typescript'),
    ],
    [
      Markup.button.callback('💎 Ruby',       'lang_ruby'),
      Markup.button.callback('🐘 PHP',        'lang_php'),
    ],
    [
      Markup.button.callback('⚡ C++',        'lang_cpp'),
      Markup.button.callback('🔵 C#',         'lang_csharp'),
    ],
    [
      Markup.button.callback('📝 Bahasa Lain', 'lang_other'),
      Markup.button.callback('🏠 Menu Utama',  'back_home'),
    ],
  ]);
}

// ============================================
// INLINE MODE RESULTS KEYBOARD
// ============================================
export function inlineResultKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.switchToCurrentChat('💬 Lanjut di chat', '')],
  ]);
}
