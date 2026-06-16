/**
 * Message Formatter Utilities
 * Helps format AI responses for Telegram
 */

/**
 * Telegram message length limit
 */
const MAX_MESSAGE_LENGTH = 4096;

/**
 * Split a long message into multiple parts that fit Telegram's limit
 * @param {string} text - Text to split
 * @param {number} maxLength - Max length per message
 * @returns {string[]} Array of message parts
 */
export function splitMessage(text, maxLength = MAX_MESSAGE_LENGTH) {
  if (text.length <= maxLength) return [text];

  const parts = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      parts.push(remaining);
      break;
    }

    // Try to find a good split point (newline, sentence end, space)
    let splitIndex = -1;

    // Look for double newline (paragraph break)
    const paraBreak = remaining.lastIndexOf('\n\n', maxLength);
    if (paraBreak > maxLength * 0.3) {
      splitIndex = paraBreak + 2;
    } else {
      // Look for single newline
      const lineBreak = remaining.lastIndexOf('\n', maxLength);
      if (lineBreak > maxLength * 0.3) {
        splitIndex = lineBreak + 1;
      } else {
        // Look for space
        const spaceBreak = remaining.lastIndexOf(' ', maxLength);
        if (spaceBreak > maxLength * 0.3) {
          splitIndex = spaceBreak + 1;
        } else {
          // Force split at max length
          splitIndex = maxLength;
        }
      }
    }

    parts.push(remaining.substring(0, splitIndex));
    remaining = remaining.substring(splitIndex);
  }

  return parts;
}

/**
 * Format code block for Telegram
 * @param {string} code - Code content
 * @param {string} language - Programming language
 * @returns {string} Formatted code block
 */
export function codeBlock(code, language = '') {
  return `\`\`\`${language}\n${code}\n\`\`\``;
}

/**
 * Format inline code for Telegram
 * @param {string} code - Code content
 * @returns {string} Formatted inline code
 */
export function inlineCode(code) {
  return `\`${code}\``;
}

/**
 * Truncate text with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Max length
 * @returns {string} Truncated text
 */
export function truncate(text, maxLength = 100) {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Escape special characters for Telegram MarkdownV2
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
export function escapeMarkdownV2(text) {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

/**
 * Extract code from AI response (if user wants just the code)
 * @param {string} response - AI response
 * @returns {{ code: string, language: string, explanation: string } | null}
 */
export function extractCode(response) {
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/;
  const match = response.match(codeBlockRegex);

  if (!match) return null;

  return {
    language: match[1] || 'text',
    code: match[2].trim(),
    explanation: response.replace(codeBlockRegex, '').trim(),
  };
}

/**
 * Create a typing indicator duration based on response length
 * @param {string} text - Response text
 * @returns {number} Duration in milliseconds
 */
export function getTypingDuration(text) {
  // Simulate typing: ~50ms per character, min 500ms, max 5000ms
  return Math.min(5000, Math.max(500, text.length * 50));
}
