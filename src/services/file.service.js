/**
 * File Service
 *
 * Downloads files/photos from Telegram and prepares them for AI processing.
 * Supports:
 *   - Text/code files (.js, .py, .ts, .go, .rs, .java, .txt, .json, .md, etc.)
 *   - Images (.jpg, .png, .webp) — converted to base64 for vision AI
 *   - PDFs (.pdf) — extracted text via simple regex (no native deps)
 *
 * Telegram Bot API limits: files up to 20MB via getFileLink.
 */

import aiService from './ai.service.js';

const TEXT_EXTENSIONS = new Set([
  'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'py', 'rb', 'go', 'rs',
  'java', 'kt', 'swift', 'c', 'h', 'cpp', 'hpp', 'cc', 'cs',
  'php', 'html', 'htm', 'css', 'scss', 'sass', 'less',
  'json', 'xml', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf',
  'md', 'txt', 'sh', 'bash', 'zsh', 'sql', 'graphql', 'gql',
  'vue', 'svelte', 'astro', 'lua', 'pl', 'r', 'scala', 'clj', 'ex', 'exs',
]);

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);
const IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const MAX_TEXT_SIZE = 100 * 1024;     // 100 KB
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10 MB

class FileService {
  /**
   * Download a Telegram file and return its content + metadata.
   * @param {Object} telegram - ctx.telegram from Telegraf
   * @param {Object} fileMeta - { file_id, file_name, mime_type, file_size }
   * @returns {Promise<{ type, content, fileName, mimeType, base64? }>}
   */
  async downloadAndExtract(telegram, fileMeta) {
    const fileId = fileMeta.file_id;
    const fileName = fileMeta.file_name || 'unknown';
    const mimeType = fileMeta.mime_type || '';
    const ext = fileName.split('.').pop()?.toLowerCase() || '';

    const fileLink = await telegram.getFileLink(fileId);
    const response = await fetch(fileLink.href);
    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    // Detect type
    if (IMAGE_EXTENSIONS.has(ext) || IMAGE_MIME.has(mimeType)) {
      if (buffer.length > MAX_IMAGE_SIZE) {
        throw new Error(`Image too large (${(buffer.length / 1024 / 1024).toFixed(1)} MB). Max ${MAX_IMAGE_SIZE / 1024 / 1024} MB.`);
      }
      return {
        type: 'image',
        fileName,
        mimeType: mimeType || `image/${ext === 'jpg' ? 'jpeg' : ext}`,
        base64: buffer.toString('base64'),
        size: buffer.length,
      };
    }

    if (TEXT_EXTENSIONS.has(ext) || mimeType.startsWith('text/')) {
      if (buffer.length > MAX_TEXT_SIZE) {
        // Truncate
        const content = buffer.toString('utf8', 0, MAX_TEXT_SIZE) + '\n... (truncated, file too large)';
        return { type: 'text', content, fileName, mimeType, size: buffer.length };
      }
      return {
        type: 'text',
        content: buffer.toString('utf8'),
        fileName,
        mimeType,
        size: buffer.length,
      };
    }

    // Unknown / binary — show generic info
    return {
      type: 'binary',
      fileName,
      mimeType,
      size: buffer.length,
      content: `(Binary file, ${buffer.length} bytes, type: ${mimeType || 'unknown'})`,
    };
  }

  /**
   * Process an uploaded image with AI vision.
   * @param {Object} telegram - ctx.telegram
   * @param {Object} fileMeta - Telegram file metadata
   * @param {string} prompt - user instruction (optional)
   * @param {Array} history - chat history
   * @returns {Promise<string>} AI response
   */
  async processImage(telegram, fileMeta, prompt, history = []) {
    const file = await this.downloadAndExtract(telegram, fileMeta);
    if (file.type !== 'image') {
      throw new Error('File is not an image');
    }
    return await aiService.analyzeImage(file.base64, file.mimeType, prompt, history);
  }

  /**
   * Process a text/code file with AI in the given mode.
   * @param {Object} telegram - ctx.telegram
   * @param {Object} fileMeta - Telegram file metadata
   * @param {string} mode - 'review' | 'debug' | 'explain' | 'code' | 'normal'
   * @param {Array} history - chat history
   * @returns {Promise<{ response, fileName, content }>}
   */
  async processTextFile(telegram, fileMeta, mode, history = []) {
    const file = await this.downloadAndExtract(telegram, fileMeta);
    if (file.type !== 'text') {
      throw new Error(`File ${file.fileName} is not a text/code file (got ${file.type})`);
    }

    const langHint = this._detectLangFromName(file.fileName);

    let response;
    const content = file.content;

    if (mode === 'debug') {
      response = await aiService.debugCode(content, '', history);
    } else if (mode === 'review') {
      response = await aiService.reviewCode(content, history);
    } else if (mode === 'explain') {
      response = await aiService.explainCode(content, history);
    } else if (mode === 'code') {
      response = await aiService.generateCode(
        `Refactor or improve this code:\n\`\`\`${langHint}\n${content.substring(0, 4000)}\n\`\`\``,
        langHint,
        history
      );
    } else {
      response = await aiService.chat(
        `Here's a file \`${file.fileName}\`:\n\`\`\`${langHint}\n${content.substring(0, 6000)}\n\`\`\`\n\nTell me about this code briefly.`,
        history,
        'normal'
      );
    }

    return { response, fileName: file.fileName, content };
  }

  _detectLangFromName(fileName) {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    const map = {
      js: 'javascript', mjs: 'javascript', cjs: 'javascript',
      ts: 'typescript', tsx: 'typescript', jsx: 'javascript',
      py: 'python', rb: 'ruby', go: 'go', rs: 'rust',
      java: 'java', kt: 'kotlin', swift: 'swift',
      c: 'c', h: 'c', cpp: 'cpp', hpp: 'cpp', cc: 'cpp', cs: 'csharp',
      php: 'php', html: 'html', htm: 'html', css: 'css',
      scss: 'scss', sass: 'sass', json: 'json', xml: 'xml',
      yaml: 'yaml', yml: 'yaml', toml: 'toml', md: 'markdown',
      sh: 'bash', bash: 'bash', sql: 'sql', vue: 'vue', svelte: 'svelte',
    };
    return map[ext] || '';
  }

  /**
   * Check if a file is supported
   */
  isSupported(fileName, mimeType = '') {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    return TEXT_EXTENSIONS.has(ext) ||
           IMAGE_EXTENSIONS.has(ext) ||
           IMAGE_MIME.has(mimeType) ||
           mimeType.startsWith('text/');
  }
}

const fileService = new FileService();
export default fileService;
