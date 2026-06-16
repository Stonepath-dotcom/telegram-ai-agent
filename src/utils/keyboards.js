import { Markup } from 'telegraf';

/**
 * Glo Agent — Luxury Keyboard Builder
 *
 * Design language:
 *  ◆  — primary action (most prominent)
 *  ✦  — secondary action (navigation, utility)
 *  ◈  — active / current selection
 *  ◇  — inactive state (paired with ◈)
 *  ⟡  — destructive / special action
 *  ❰ ❱ — optional brackets for emphasized buttons
 *
 * Buttons are kept short and clean so the layout breathes
 * on both desktop and mobile Telegram clients.
 */

// ============================================
// MODE SELECTION — diamond pair indicates active
// ============================================
export function modeKeyboard(currentMode = 'normal') {
  const modes = [
    { id: 'normal',  label: 'Chat',      icon: '💬' },
    { id: 'code',    label: 'Code',      icon: '🧑‍💻' },
    { id: 'debug',   label: 'Debug',     icon: '🐛' },
    { id: 'review',  label: 'Review',    icon: '🔍' },
    { id: 'explain', label: 'Explain',   icon: '📖' },
  ];

  const buttons = modes.map(m => {
    const isActive = m.id === currentMode;
    const text = isActive
      ? `◈ ${m.icon} ${m.label} ◈`
      : `◇ ${m.icon} ${m.label}`;
    return Markup.button.callback(text, `mode_${m.id}`);
  });

  return Markup.inlineKeyboard([
    [buttons[0], buttons[1]],
    [buttons[2], buttons[3]],
    [buttons[4]],
    [Markup.button.callback('⟡ Kembali ke Menu', 'back_home')],
  ]);
}

// ============================================
// MAIN MENU — premium landing
// ============================================
export function mainMenuKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('◆ Generate Kode',    'quick_code'),
      Markup.button.callback('◆ Debug Kode',       'quick_debug'),
    ],
    [
      Markup.button.callback('◆ Review Kode',      'quick_review'),
      Markup.button.callback('◆ Jelaskan Kode',    'quick_explain'),
    ],
    [
      Markup.button.callback('✦ Ganti Mode',       'show_modes'),
      Markup.button.callback('✦ Statistik',        'show_stats'),
    ],
    [
      Markup.button.callback('⟡ Hapus Riwayat',    'clear_history'),
    ],
  ]);
}

// ============================================
// AFTER RESPONSE — shown under AI replies
// ============================================
export function afterResponseKeyboard(currentMode) {
  const modeLabels = {
    normal:  '💬 Chat',
    code:    '🧑‍💻 Code',
    debug:   '🐛 Debug',
    review:  '🔍 Review',
    explain: '📖 Explain',
  };

  return Markup.inlineKeyboard([
    [
      Markup.button.callback('✦ Ganti Mode', 'show_modes'),
      Markup.button.callback(`◈ ${modeLabels[currentMode] || '💬 Chat'} aktif`, 'noop'),
    ],
    [
      Markup.button.callback('⟡ Hapus Riwayat', 'clear_history'),
      Markup.button.callback('✦ Statistik',     'show_stats'),
    ],
  ]);
}

// ============================================
// CONFIRM — destructive action confirmation
// ============================================
export function confirmKeyboard(action, confirmText = '◆ Ya', cancelText = '◇ Batal') {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(confirmText, `confirm_${action}`),
      Markup.button.callback(cancelText,  'cancel_action'),
    ],
  ]);
}

// ============================================
// HELP NAVIGATION — guide pages
// ============================================
export function helpKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('◆ Panduan Code',    'help_code'),
      Markup.button.callback('◆ Panduan Debug',   'help_debug'),
    ],
    [
      Markup.button.callback('◆ Panduan Review',  'help_review'),
      Markup.button.callback('◆ Panduan Explain', 'help_explain'),
    ],
    [
      Markup.button.callback('◆ Panduan Chat',    'help_chat'),
      Markup.button.callback('✦ Menu Utama',      'back_home'),
    ],
  ]);
}

// ============================================
// STATS — refresh + home
// ============================================
export function statsKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('✦ Refresh',    'show_stats'),
      Markup.button.callback('✦ Menu Utama', 'back_home'),
    ],
  ]);
}

// ============================================
// BACK HOME — single button
// ============================================
export function backHomeKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('✦ Menu Utama', 'back_home')],
  ]);
}

// ============================================
// LANGUAGE SELECT — premium language picker
// ============================================
export function languageSelectKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('◆ Python',     'lang_python'),
      Markup.button.callback('◆ JavaScript', 'lang_javascript'),
    ],
    [
      Markup.button.callback('◆ Rust',       'lang_rust'),
      Markup.button.callback('◆ Go',         'lang_go'),
    ],
    [
      Markup.button.callback('◆ Java',       'lang_java'),
      Markup.button.callback('◆ TypeScript', 'lang_typescript'),
    ],
    [
      Markup.button.callback('◆ Ruby',       'lang_ruby'),
      Markup.button.callback('◆ PHP',        'lang_php'),
    ],
    [
      Markup.button.callback('◆ C++',        'lang_cpp'),
      Markup.button.callback('◆ C#',         'lang_csharp'),
    ],
    [
      Markup.button.callback('✦ Bahasa Lain',  'lang_other'),
      Markup.button.callback('✦ Menu Utama',   'back_home'),
    ],
  ]);
}
