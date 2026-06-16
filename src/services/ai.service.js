/**
 * AI Service - Multi-provider support for OpenAI-compatible APIs
 *
 * Supports:
 * - Z.ai SDK (for local/internal use)
 * - OpenAI-compatible APIs: Groq, OpenAI, OpenRouter, Together AI, etc.
 *
 * Environment variables:
 * - AI_PROVIDER: "zai" | "openai" | "groq" | "openrouter" | "together" | "custom" (default: auto-detect)
 * - AI_API_KEY: API key for the provider
 * - AI_BASE_URL: Base URL for custom provider (e.g., https://api.groq.com/openai/v1)
 * - AI_MODEL: Model name (e.g., llama-3.3-70b-versatile for Groq)
 *
 * For Z.ai SDK (local/internal only):
 * - ZAI_BASE_URL, ZAI_API_KEY, ZAI_TOKEN, ZAI_CHAT_ID, ZAI_USER_ID
 */

import config from '../../config/default.js';

// Provider presets
const PROVIDER_PRESETS = {
  groq: {
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    // Fallback models when primary is rate-limited or unavailable
    fallbackModels: [
      'llama-3.1-8b-instant',
      'gemma2-9b-it',
      'llama3-70b-8192',
      'llama3-8b-8192',
    ],
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    fallbackModels: ['gpt-4o-mini', 'gpt-3.5-turbo'],
  },
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
    // Fallback models when primary is rate-limited
    fallbackModels: [
      'qwen/qwen3-coder:free',
      'google/gemma-4-31b-it:free',
      'meta-llama/llama-3.2-3b-instruct:free',
    ],
  },
  together: {
    baseUrl: 'https://api.together.xyz/v1',
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free',
    fallbackModels: ['meta-llama/Llama-3.3-70B-Instruct-Turbo-Free'],
  },
};

class AIService {
  constructor() {
    this.provider = null;
    this.baseUrl = null;
    this.apiKey = null;
    this.model = null;
    this.zai = null;
    this.initialized = false;
  }

  /**
   * Initialize the AI service
   * Auto-detects provider based on environment variables
   */
  async initialize() {
    if (this.initialized) return;

    try {
      const provider = (process.env.AI_PROVIDER || '').toLowerCase();

      // Determine provider and config
      if (provider && provider !== 'zai' && PROVIDER_PRESETS[provider]) {
        // Use preset provider
        const preset = PROVIDER_PRESETS[provider];
        this.provider = provider;
        this.baseUrl = process.env.AI_BASE_URL || preset.baseUrl;
        this.apiKey = process.env.AI_API_KEY;
        this.model = process.env.AI_MODEL || preset.defaultModel;

        if (!this.apiKey) {
          console.error(`⚠️ AI_PROVIDER=${provider} but AI_API_KEY is not set!`);
          console.error(`⚠️ Get your API key from ${this._getProviderKeyUrl(provider)}`);
          this.initialized = false;
          return;
        }

        console.log(`✅ AI Provider: ${provider}`);
        console.log(`✅ AI Base URL: ${this.baseUrl}`);
        console.log(`✅ AI Model: ${this.model}`);
        this.initialized = true;
        return;
      }

      if (provider === 'custom' || (process.env.AI_BASE_URL && process.env.AI_API_KEY)) {
        // Custom OpenAI-compatible provider
        this.provider = 'custom';
        this.baseUrl = process.env.AI_BASE_URL;
        this.apiKey = process.env.AI_API_KEY;
        this.model = process.env.AI_MODEL || 'gpt-3.5-turbo';

        if (!this.apiKey) {
          console.error('⚠️ AI_PROVIDER=custom but AI_API_KEY is not set!');
          this.initialized = false;
          return;
        }

        console.log(`✅ AI Provider: custom (${this.baseUrl})`);
        console.log(`✅ AI Model: ${this.model}`);
        this.initialized = true;
        return;
      }

      // Fall back to Z.ai SDK (only works inside Z.ai infrastructure)
      console.log('📋 No AI_PROVIDER set. Trying Z.ai SDK (works only inside Z.ai infra)...');
      await this._initializeZAI();
    } catch (error) {
      console.error('⚠️ Failed to initialize AI service:', error.message);
      console.error('⚠️ Set AI_PROVIDER, AI_API_KEY env vars for AI features.');
      this.initialized = false;
    }
  }

  /**
   * Initialize Z.ai SDK (local/internal only)
   */
  async _initializeZAI() {
    try {
      const ZAI = (await import('z-ai-web-dev-sdk')).default;
      const fs = await import('fs');
      const path = await import('path');
      const os = await import('os');

      const configPaths = [
        path.join(process.cwd(), '.z-ai-config'),
        path.join(os.homedir(), '.z-ai-config'),
        '/etc/.z-ai-config',
      ];

      let configExists = false;
      for (const p of configPaths) {
        try {
          if (fs.existsSync(p)) {
            configExists = true;
            console.log(`📋 Found ZAI config at: ${p}`);
            break;
          }
        } catch (e) { /* skip */ }
      }

      if (!configExists) {
        const zaiBaseUrl = process.env.ZAI_BASE_URL;
        const zaiApiKey = process.env.ZAI_API_KEY;

        if (zaiBaseUrl && zaiApiKey) {
          const configData = JSON.stringify({
            baseUrl: zaiBaseUrl,
            apiKey: zaiApiKey,
            ...(process.env.ZAI_TOKEN ? { token: process.env.ZAI_TOKEN } : {}),
            chatId: process.env.ZAI_CHAT_ID || '',
            userId: process.env.ZAI_USER_ID || '',
          }, null, 2);

          try {
            fs.writeFileSync(path.join(process.cwd(), '.z-ai-config'), configData);
          } catch (e) {
            fs.writeFileSync('/tmp/.z-ai-config', configData);
          }
          console.log('✅ Created ZAI config from env vars');
        } else {
          console.error('⚠️ No ZAI config or AI_PROVIDER env vars set!');
          this.initialized = false;
          return;
        }
      }

      this.zai = await ZAI.create();
      this.provider = 'zai';
      this.initialized = true;
      console.log('✅ Z.ai SDK initialized');
    } catch (error) {
      console.error('⚠️ ZAI SDK init failed:', error.message);
      this.initialized = false;
    }
  }

  _getProviderKeyUrl(provider) {
    const urls = {
      groq: 'https://console.groq.com/keys',
      openai: 'https://platform.openai.com/api-keys',
      openrouter: 'https://openrouter.ai/keys',
      together: 'https://api.together.xyz/settings/api-keys',
    };
    return urls[provider] || 'provider docs';
  }

  async ensureInitialized() {
    if (!this.initialized) {
      await this.initialize();
    }
    if (!this.initialized) {
      throw new Error(
        'AI service is not configured. Set AI_PROVIDER=groq and AI_API_KEY=your_key ' +
        '(get free key at https://console.groq.com/keys)'
      );
    }
  }

  /**
   * Call OpenAI-compatible chat completions API with fallback support
   */
  async _callOpenAICompatible(messages, options = {}) {
    const url = `${this.baseUrl}/chat/completions`;
    const preset = PROVIDER_PRESETS[this.provider];
    const modelsToTry = [options.model || this.model, ...(preset?.fallbackModels || [])];
    const triedModels = new Set();
    let lastError = null;

    for (const model of modelsToTry) {
      if (triedModels.has(model)) continue;
      triedModels.add(model);

      const body = {
        model,
        messages,
        temperature: options.temperature ?? config.ai.temperature,
        max_tokens: options.max_tokens ?? config.ai.maxTokens,
      };

      // Mask API key in error logs
      const maskedKey = this.apiKey ? `${this.apiKey.substring(0, 8)}...${this.apiKey.substring(this.apiKey.length - 4)}` : 'NOT_SET';

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
            ...(this.provider === 'openrouter' ? {
              'HTTP-Referer': 'https://github.com/Stonepath-dotcom/telegram-ai-agent',
              'X-Title': 'Glo Agent',
            } : {}),
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
          const errorText = await response.text();
          let errorParsed = errorText;
          try {
            const parsed = JSON.parse(errorText);
            errorParsed = parsed.error?.message || parsed.message || errorText;
          } catch (e) { /* keep raw text */ }

          console.warn(`⚠️ [${this.provider}] model=${model} status=${response.status} key=${maskedKey}`);
          console.warn(`⚠️ Error: ${String(errorParsed).substring(0, 200)}`);

          // If rate-limited (429), model not found (404), or model deprecated (400 with model error), try next fallback
          const shouldFallback = response.status === 429 ||
                                 response.status === 404 ||
                                 (response.status === 400 && /model/i.test(errorParsed));

          if (shouldFallback) {
            lastError = new Error(`[${this.provider}] ${response.status}: ${String(errorParsed).substring(0, 120)}`);
            continue;
          }

          // Auth errors - don't retry, fail fast with clear message
          if (response.status === 401 || response.status === 403) {
            throw new Error(`[${this.provider}] AUTH FAILED (${response.status}). API key invalid or expired. Key used: ${maskedKey}. ${String(errorParsed).substring(0, 100)}`);
          }

          throw new Error(`[${this.provider}] ${response.status}: ${String(errorParsed).substring(0, 200)}`);
        }

        const data = await response.json();
        if (model !== this.model) {
          console.log(`✅ Used fallback model: ${model}`);
        }
        const content = data.choices?.[0]?.message?.content;
        if (!content) {
          console.warn('⚠️ Empty content from AI:', JSON.stringify(data).substring(0, 200));
          return 'Maaf, AI tidak memberikan respons. Coba ketik ulang dengan lebih spesifik.';
        }
        return content;
      } catch (err) {
        if (err.name === 'AbortError') {
          console.warn(`⚠️ Model ${model} TIMEOUT (30s)`);
          lastError = new Error(`[${this.provider}] Request timeout (30s) for model ${model}`);
        } else {
          console.warn(`⚠️ Model ${model} failed: ${err.message.substring(0, 120)}`);
          lastError = err;
        }
        continue;
      }
    }

    throw lastError || new Error(`[${this.provider}] All models failed`);
  }

  /**
   * Get diagnostic status - useful for /aistatus command
   */
  getStatus() {
    return {
      initialized: this.initialized,
      provider: this.provider,
      baseUrl: this.baseUrl,
      model: this.model,
      hasApiKey: !!this.apiKey,
      apiKeyMasked: this.apiKey
        ? `${this.apiKey.substring(0, 8)}...${this.apiKey.substring(this.apiKey.length - 4)}`
        : 'NOT_SET',
      apiKeyLength: this.apiKey ? this.apiKey.length : 0,
      envProvider: process.env.AI_PROVIDER || '(not set)',
      envModel: process.env.AI_MODEL || '(using default)',
      envBaseUrl: process.env.AI_BASE_URL || '(using default)',
    };
  }

  /**
   * Test AI connection with a tiny request - useful for diagnostics
   * Returns { ok: boolean, message: string, model: string }
   */
  async testConnection() {
    if (!this.initialized) {
      await this.initialize();
    }
    if (!this.initialized) {
      return {
        ok: false,
        message: 'AI service not initialized. Set AI_PROVIDER and AI_API_KEY env vars.',
        model: '-',
      };
    }

    if (this.provider === 'zai') {
      try {
        const completion = await this.zai.chat.completions.create({
          messages: [{ role: 'user', content: 'Say OK' }],
          max_tokens: 10,
        });
        return {
          ok: true,
          message: 'Z.ai SDK OK',
          model: 'zai',
        };
      } catch (e) {
        return { ok: false, message: `Z.ai error: ${e.message}`, model: 'zai' };
      }
    }

    try {
      const response = await this._callOpenAICompatible(
        [{ role: 'user', content: 'Say OK' }],
        { max_tokens: 10 }
      );
      return {
        ok: true,
        message: `Connection OK. Response: ${response.substring(0, 50)}`,
        model: this.model,
      };
    } catch (e) {
      return { ok: false, message: e.message, model: this.model };
    }
  }

  /**
   * General chat completion
   */
  async chat(userMessage, history = [], mode = 'normal') {
    await this.ensureInitialized();

    const systemPrompt = this._getSystemPrompt(mode);
    const messages = this._buildMessages(systemPrompt, history, userMessage);

    try {
      if (this.provider === 'zai') {
        const completion = await this.zai.chat.completions.create({
          messages,
          temperature: config.ai.temperature,
          max_tokens: config.ai.maxTokens,
        });
        return completion.choices[0]?.message?.content || 'Maaf, saya tidak bisa memproses permintaan Anda.';
      }
      return await this._callOpenAICompatible(messages);
    } catch (error) {
      console.error('AI Chat Error:', error.message);
      // Preserve the original error message with provider prefix so users can see real cause
      throw error;
    }
  }

  /**
   * Generate code based on description
   */
  async generateCode(description, language = '', history = []) {
    await this.ensureInitialized();

    const langHint = language ? ` in ${language}` : '';
    const systemPrompt = `You are Glo Agent, a premium AI coding specialist. Write clean, production-ready code${langHint}.

OUTPUT RULES (CRITICAL):
- DO NOT use ### markdown headers. They are noisy in chat.
- Use **bold** for labels instead of headers.
- Structure: one short intro paragraph → code block → brief notes (if any).
- Keep intro under 3 sentences. Do not over-explain.
- Add helpful comments inside the code, not as separate prose.
- Include error handling where reasonable.
- Always use markdown code blocks with language identifier.
- Respond in the same language the user uses.`;

    const messages = this._buildMessages(systemPrompt, history, `Write code${langHint} for: ${description}`);

    try {
      if (this.provider === 'zai') {
        const completion = await this.zai.chat.completions.create({
          messages,
          temperature: 0.4,
          max_tokens: config.ai.maxTokens,
        });
        return completion.choices[0]?.message?.content || 'Gagal generate kode.';
      }
      return await this._callOpenAICompatible(messages, { temperature: 0.4 });
    } catch (error) {
      console.error('Code Generation Error:', error.message);
      throw error; // preserve original message
    }
  }

  /**
   * Debug code - find and fix bugs
   */
  async debugCode(code, errorMsg = '', history = []) {
    await this.ensureInitialized();

    const systemPrompt = `You are Glo Agent, a premium AI debugging specialist. Find bugs efficiently and explain root cause.

OUTPUT RULES (CRITICAL):
- DO NOT use ### markdown headers. They are noisy in chat.
- Use **bold** for labels instead of headers.
- Structure: **Bug:** one-sentence root cause → fixed code block → **Why:** brief explanation.
- Keep it tight. No long preambles.
- Always use markdown code blocks with language identifier.
- Respond in the same language the user uses.`;

    const userMsg = errorMsg
      ? `Debug this code. Error message: \`\`\`\n${errorMsg}\n\`\`\`\n\nCode:\n\`\`\`\n${code}\n\`\`\``
      : `Debug this code and find any bugs:\n\`\`\`\n${code}\n\`\`\``;

    const messages = this._buildMessages(systemPrompt, history, userMsg);

    try {
      if (this.provider === 'zai') {
        const completion = await this.zai.chat.completions.create({
          messages,
          temperature: 0.3,
          max_tokens: config.ai.maxTokens,
        });
        return completion.choices[0]?.message?.content || 'Gagal menganalisis kode.';
      }
      return await this._callOpenAICompatible(messages, { temperature: 0.3 });
    } catch (error) {
      console.error('Debug Error:', error.message);
      throw error;
    }
  }

  /**
   * Review code - analyze quality, security, performance
   */
  async reviewCode(code, history = []) {
    await this.ensureInitialized();

    const systemPrompt = `You are Glo Agent, a premium AI code reviewer. Analyze quality, security, performance, and maintainability.

OUTPUT RULES (CRITICAL):
- DO NOT use ### markdown headers. They are noisy in chat.
- Use **bold** for labels instead of headers.
- Structure your review as flat bullet lists under these bold labels:
  🟢 **Kelebihan** — what's good
  🟡 **Saran** — what could be improved
  🔴 **Wajib fix** — what must be fixed
- Keep each bullet to one line. Be specific and actionable.
- Provide improved code snippets only where needed, with language identifier.
- Respond in the same language the user uses.`;

    const messages = this._buildMessages(systemPrompt, history, `Review this code:\n\`\`\`\n${code}\n\`\`\``);

    try {
      if (this.provider === 'zai') {
        const completion = await this.zai.chat.completions.create({
          messages,
          temperature: 0.4,
          max_tokens: config.ai.maxTokens,
        });
        return completion.choices[0]?.message?.content || 'Gagal mereview kode.';
      }
      return await this._callOpenAICompatible(messages, { temperature: 0.4 });
    } catch (error) {
      console.error('Review Error:', error.message);
      throw error;
    }
  }

  /**
   * Explain code - break down complex logic
   */
  async explainCode(code, history = []) {
    await this.ensureInitialized();

    const systemPrompt = `You are Glo Agent, a premium AI code explanation specialist. Break down code into simple, understandable parts.

OUTPUT RULES (CRITICAL):
- DO NOT use ### markdown headers. They are noisy in chat.
- Use **bold** for labels instead of headers.
- Structure: one-paragraph overview → numbered step-by-step explanation → optional key takeaway.
- Use analogies when helpful.
- Keep paragraphs short (2-3 sentences max).
- Respond in the same language the user uses.`;

    const messages = this._buildMessages(systemPrompt, history, `Explain this code:\n\`\`\`\n${code}\n\`\`\``);

    try {
      if (this.provider === 'zai') {
        const completion = await this.zai.chat.completions.create({
          messages,
          temperature: 0.5,
          max_tokens: config.ai.maxTokens,
        });
        return completion.choices[0]?.message?.content || 'Gagal menjelaskan kode.';
      }
      return await this._callOpenAICompatible(messages, { temperature: 0.5 });
    } catch (error) {
      console.error('Explain Error:', error.message);
      throw error;
    }
  }

  _buildMessages(systemPrompt, history, userMessage) {
    const messages = [{ role: 'system', content: systemPrompt }];
    for (const msg of history) {
      messages.push({ role: msg.role, content: msg.content });
    }
    messages.push({ role: 'user', content: userMessage });
    return messages;
  }

  _getSystemPrompt(mode) {
    const modePrompts = {
      normal: `You are Glo Agent, a premium AI coding assistant. Help users write, review, debug, and explain code.\n\nOUTPUT RULES (CRITICAL):\n- DO NOT use ### markdown headers. They are noisy and ugly in chat.\n- Use **bold** for labels instead of headers.\n- Keep formatting flat and scannable: short paragraphs, bullet lists, and code blocks only.\n- At most one short intro paragraph before any code block.\n- Always use markdown code blocks with language identifier.\n- Respond in the same language the user uses.`,
      code: `You are Glo Agent, a premium AI coding specialist. Focus on writing excellent, production-ready code. Always use markdown code blocks with language identifiers. Do NOT use ### markdown headers — use **bold** for labels. Keep output flat and scannable. Respond in the same language the user uses.`,
      debug: `You are Glo Agent, a premium AI debugging specialist. Find bugs efficiently. Always explain the root cause before providing the fix. Do NOT use ### markdown headers — use **bold** for labels. Keep output flat. Respond in the same language the user uses.`,
      review: `You are Glo Agent, a premium AI code review specialist. Focus on code quality, security, performance, and maintainability. Do NOT use ### markdown headers — use **bold** for labels and flat bullet lists. Provide actionable, prioritized feedback. Respond in the same language the user uses.`,
      explain: `You are Glo Agent, a premium AI code explanation specialist. Break down code into simple, understandable parts. Do NOT use ### markdown headers — use **bold** for labels. Use analogies when helpful. Be patient and clear. Respond in the same language the user uses.`,
    };
    return modePrompts[mode] || modePrompts.normal;
  }
}

const aiService = new AIService();
export default aiService;
