import { Markup } from 'telegraf';

/**
 * Professional Keyboard Builder
 * Creates consistent, well-organized inline keyboards
 */

// ============================================
// COLOR-CODED BUTTON STYLES
// ============================================

/**
 * Mode selection keyboard - with visual indicators
 */
export function modeKeyboard(currentMode = 'normal') {
  const modes = [
    { id: 'normal',  label: '💬 Chat',       desc: 'Chat Biasa' },
    { id: 'code',    label: '🧑‍💻 Code',      desc: 'Generate Kode' },
    { id: 'debug',   label: '🐛 Debug',      desc: 'Cari & Perbaiki Bug' },
    { id: 'review',  label: '🔍 Review',     desc: 'Code Review' },
    { id: 'explain', label: '📖 Explain',    desc: 'Jelaskan Kode' },
  ];

  const buttons = modes.map(m => {
    const isActive = m.id === currentMode;
    const text = isActive ? `✅ ${m.label}` : m.label;
    return Markup.button.callback(text, `mode_${m.id}`);
  });

  // 2 columns for first 4, then 1 for the last
  return Markup.inlineKeyboard([
    [buttons[0], buttons[1]],
    [buttons[2], buttons[3]],
    [buttons[4]],
  ]);
}

/**
 * Main menu keyboard - shown on /start
 */
export function mainMenuKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('🧑‍💻 Generate Kode', 'quick_code'),
      Markup.button.callback('🐛 Debug Kode', 'quick_debug'),
    ],
    [
      Markup.button.callback('🔍 Review Kode', 'quick_review'),
      Markup.button.callback('📖 Explain Kode', 'quick_explain'),
    ],
    [
      Markup.button.callback('🔄 Ganti Mode', 'show_modes'),
      Markup.button.callback('📊 Stats', 'show_stats'),
    ],
    [
      Markup.button.callback('🗑️ Hapus Riwayat', 'clear_history'),
    ],
  ]);
}

/**
 * Quick actions keyboard - shown after AI responses
 */
export function afterResponseKeyboard(currentMode) {
  const modeLabels = {
    normal: '💬 Chat',
    code: '🧑‍💻 Code',
    debug: '🐛 Debug',
    review: '🔍 Review',
    explain: '📖 Explain',
  };

  return Markup.inlineKeyboard([
    [
      Markup.button.callback('🔄 Ganti Mode', 'show_modes'),
      Markup.button.callback(`${modeLabels[currentMode] || '💬 Chat'} (aktif)`, 'noop'),
    ],
    [
      Markup.button.callback('🗑️ Hapus Riwayat', 'clear_history'),
      Markup.button.callback('📊 Stats', 'show_stats'),
    ],
  ]);
}

/**
 * Confirm action keyboard
 */
export function confirmKeyboard(action, confirmText = '✅ Ya', cancelText = '❌ Batal') {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(confirmText, `confirm_${action}`),
      Markup.button.callback(cancelText, 'cancel_action'),
    ],
  ]);
}

/**
 * Help navigation keyboard
 */
export function helpKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('🧑‍💻 Code Guide', 'help_code'),
      Markup.button.callback('🐛 Debug Guide', 'help_debug'),
    ],
    [
      Markup.button.callback('🔍 Review Guide', 'help_review'),
      Markup.button.callback('📖 Explain Guide', 'help_explain'),
    ],
    [
      Markup.button.callback('💬 Chat Guide', 'help_chat'),
      Markup.button.callback('🏠 Menu Utama', 'back_home'),
    ],
  ]);
}

/**
 * Stats keyboard with refresh button
 */
export function statsKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('🔄 Refresh', 'show_stats'),
      Markup.button.callback('🏠 Menu Utama', 'back_home'),
    ],
  ]);
}

/**
 * Back to home keyboard
 */
export function backHomeKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('🏠 Menu Utama', 'back_home')],
  ]);
}

/**
 * Quick-code prompt keyboard - language selection
 */
export function languageSelectKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('🐍 Python', 'lang_python'),
      Markup.button.callback('🟨 JavaScript', 'lang_javascript'),
    ],
    [
      Markup.button.callback('🦀 Rust', 'lang_rust'),
      Markup.button.callback('🐹 Go', 'lang_go'),
    ],
    [
      Markup.button.callback('☕ Java', 'lang_java'),
      Markup.button.callback('⚛️ TypeScript', 'lang_typescript'),
    ],
    [
      Markup.button.callback('💎 Ruby', 'lang_ruby'),
      Markup.button.callback('🐘 PHP', 'lang_php'),
    ],
    [
      Markup.button.callback('⚡ C++', 'lang_cpp'),
      Markup.button.callback('🔵 C#', 'lang_csharp'),
    ],
    [
      Markup.button.callback('📝 Lainnya...', 'lang_other'),
      Markup.button.callback('🏠 Menu Utama', 'back_home'),
    ],
  ]);
}
