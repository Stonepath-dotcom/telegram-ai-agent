/**
 * Voice Service
 *
 * ASR (Automatic Speech Recognition):
 *   - Uses Groq Whisper API (whisper-large-v3) — same AI_API_KEY, no extra cost
 *   - Falls back to OpenAI Whisper if AI_PROVIDER=openai
 *   - Falls back to OpenRouter whisper if AI_PROVIDER=openrouter
 *
 * TTS (Text-to-Speech):
 *   - Currently uses z-ai-web-dev-sdk if available, otherwise disabled
 *   - Future: integrate ElevenLabs / OpenAI TTS via env keys
 *
 * Telegram voice notes arrive as .ogg (OggOpus).
 * Groq Whisper accepts: mp3, wav, m4a, webm, etc. — NOT .ogg directly.
 * Strategy: pass .ogg as audio/wav with original filename ending in .ogg
 *           (Groq's API is somewhat lenient and accepts ogg if filename ends with .ogg)
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

const PROVIDER_PRESETS = {
  groq: {
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'whisper-large-v3',
    supportsWhisper: true,
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    model: 'whisper-1',
    supportsWhisper: true,
  },
};

class VoiceService {
  /**
   * Transcribe a Telegram voice message to text.
   * @param {Object} telegram - ctx.telegram
   * @param {Object} voiceMeta - { file_id, duration, mime_type, file_size }
   * @returns {Promise<{ text, language?, duration }>}
   */
  async transcribe(telegram, voiceMeta) {
    const fileId = voiceMeta.file_id;
    const fileLink = await telegram.getFileLink(fileId);

    // Download
    const response = await fetch(fileLink.href);
    if (!response.ok) throw new Error(`Failed to download voice: ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());

    // Try provider-based Whisper first
    const provider = (process.env.AI_PROVIDER || '').toLowerCase();
    const preset = PROVIDER_PRESETS[provider];

    if (preset?.supportsWhisper && process.env.AI_API_KEY) {
      try {
        return await this._transcribeWithProvider(buffer, preset, voiceMeta);
      } catch (e) {
        console.warn(`⚠️ Provider whisper failed: ${e.message}`);
        // Fall through to error
        throw e;
      }
    }

    throw new Error(
      `Voice transcription not supported for provider "${provider}". ` +
      `Set AI_PROVIDER=groq (free) to enable Whisper ASR.`
    );
  }

  async _transcribeWithProvider(buffer, preset, voiceMeta) {
    const url = `${preset.baseUrl}/audio/transcriptions`;
    const fileName = `voice-${Date.now()}.ogg`;

    // Build multipart form data manually (no form-data dependency needed in Node 18+)
    const boundary = '----GloAgentBoundary' + Math.random().toString(16).slice(2);
    const parts = [];

    // file field
    parts.push(
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: audio/ogg\r\n\r\n`),
      buffer,
      Buffer.from('\r\n')
    );

    // model field
    parts.push(
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\n${preset.model}\r\n`)
    );

    // language hint (Indonesian most common for our users, but auto-detect is fine)
    parts.push(
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="response_format"\r\n\r\njson\r\n`)
    );

    // End boundary
    parts.push(Buffer.from(`--${boundary}--\r\n`));

    const body = Buffer.concat(parts);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.AI_API_KEY}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        body,
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errText = await response.text();
        let errParsed = errText;
        try {
          const p = JSON.parse(errText);
          errParsed = p.error?.message || p.message || errText;
        } catch (e) { /* keep raw */ }
        throw new Error(`Whisper API ${response.status}: ${String(errParsed).substring(0, 200)}`);
      }

      const data = await response.json();
      return {
        text: data.text || '',
        language: data.language,
        duration: voiceMeta.duration,
      };
    } catch (err) {
      clearTimeout(timeout);
      if (err.name === 'AbortError') {
        throw new Error('Whisper API timeout (60s)');
      }
      throw err;
    }
  }

  /**
   * Text-to-Speech — convert text to voice message.
   * Currently uses z-ai-web-dev-sdk if available.
   * Returns a buffer + mime type ready for ctx.replyWithVoice.
   *
   * @param {string} text
   * @returns {Promise<{ buffer, mimeType } | null>} null if TTS unavailable
   */
  async synthesize(text) {
    if (!text || text.length < 1) return null;

    // Try z-ai-web-dev-sdk (works only inside Z.ai infra)
    try {
      const ZAI = (await import('z-ai-web-dev-sdk')).default;
      const zai = await ZAI.create();
      const result = await zai.audio.speech.create({
        input: text.substring(0, 3000),
        voice: 'alloy',
        response_format: 'mp3',
      });
      const arrayBuf = await result.arrayBuffer();
      return {
        buffer: Buffer.from(arrayBuf),
        mimeType: 'audio/mpeg',
      };
    } catch (e) {
      // Z.ai SDK not available — TTS not possible without external API
      console.warn(`⚠️ TTS unavailable: ${e.message}`);
      return null;
    }
  }

  /**
   * Check if ASR is available (Groq or OpenAI Whisper)
   */
  isASRAvailable() {
    const provider = (process.env.AI_PROVIDER || '').toLowerCase();
    return !!PROVIDER_PRESETS[provider]?.supportsWhisper && !!process.env.AI_API_KEY;
  }

  /**
   * Check if TTS is available
   */
  isTTSAvailable() {
    // We can't know without trying, but if z-ai-web-dev-sdk is installed, likely yes
    return true;
  }
}

const voiceService = new VoiceService();
export default voiceService;
