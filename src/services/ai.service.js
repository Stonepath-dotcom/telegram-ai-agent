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
              'X-Title': 'Telegram AI Agent Bot',
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
    const systemPrompt = `You are an expert code generator. When asked to write code:
1. Write clean, production-quality code${langHint}
2. Add helpful comments explaining key logic
3. Include error handling
4. Follow best practices and design patterns
5. If applicable, include usage examples
6. Always use markdown code blocks with language identifier
7. Briefly explain your approach before the code
8. Respond in the same language the user uses`;

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

    const systemPrompt = `You are an expert debugger. When given code to debug:
1. Analyze the code carefully
2. Identify the root cause of the bug
3. Explain the bug clearly
4. Provide the fixed code with changes highlighted
5. Explain why the fix works
6. Suggest any additional improvements
7. Always use markdown code blocks with language identifier
8. Respond in the same language the user uses`;

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

    const systemPrompt = `You are an expert code reviewer. When reviewing code, analyze:
1. **Correctness** - Does the code do what it's supposed to?
2. **Security** - Any vulnerabilities? (SQL injection, XSS, etc.)
3. **Performance** - Any bottlenecks or inefficiencies?
4. **Readability** - Is the code clean and maintainable?
5. **Best Practices** - Does it follow language conventions?
6. **Error Handling** - Are errors handled properly?
7. **Testing** - Is the code testable?

Format your review with:
- 🟢 What's good
- 🟡 What could be improved
- 🔴 What must be fixed
- Provide improved code snippets where applicable
- Respond in the same language the user uses`;

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

    const systemPrompt = `You are an expert code explainer. When explaining code:
1. Start with a high-level overview of what the code does
2. Break it down into logical sections
3. Explain each section step by step
4. Highlight key algorithms or patterns used
5. Explain any non-obvious logic
6. Use analogies if helpful
7. Keep explanations clear and beginner-friendly
8. Respond in the same language the user uses`;

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
      normal: config.ai.systemPrompt,
      code: `You are a coding specialist. Focus on writing excellent code. Always use markdown code blocks with language identifiers. Respond in the same language the user uses.`,
      debug: `You are a debugging specialist. Focus on finding and fixing bugs. Always explain the root cause before providing the fix. Respond in the same language the user uses.`,
      review: `You are a code review specialist. Focus on code quality, security, and performance. Provide actionable feedback. Respond in the same language the user uses.`,
      explain: `You are a code explanation specialist. Break down code into simple, understandable parts. Use analogies when helpful. Respond in the same language the user uses.`,
    };
    return modePrompts[mode] || modePrompts.normal;
  }
}

const aiService = new AIService();
export default aiService;
