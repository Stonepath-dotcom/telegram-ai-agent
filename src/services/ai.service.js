/**
 * AI Service v3 — Premium Multi-Provider with:
 * - Streaming responses (SSE)
 * - Vision support (Groq llama-4-scout / OpenRouter vision models)
 * - Multi-model routing (simple vs complex query)
 * - Tool calling (web_search, run_code)
 * - Robust fallback models per provider
 * - 30s timeout, masked API keys, JSON error parsing
 *
 * Env vars:
 * - AI_PROVIDER: groq | openai | openrouter | together | custom | zai
 * - AI_API_KEY: provider API key
 * - AI_BASE_URL: override base URL
 * - AI_MODEL: override primary model
 * - AI_VISION_MODEL: override vision model (default: provider preset)
 * - AI_FAST_MODEL: override fast/lightweight model (default: provider preset)
 */

import config from '../../config/default.js';
import sandboxService from './sandbox.service.js';
import webSearchService from './web-search.service.js';

// Tool definitions exposed to the AI when running chatWithTools()
const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'run_code',
      description: 'Execute code in a sandbox (Piston API, 30+ languages). Use when user asks to run, test, or execute code. Returns stdout, stderr, and exit code.',
      parameters: {
        type: 'object',
        properties: {
          language: {
            type: 'string',
            description: 'Programming language: python, javascript, typescript, go, rust, c, c++, java, ruby, php, bash, etc.',
            enum: ['python', 'javascript', 'typescript', 'go', 'rust', 'c', 'c++', 'java', 'ruby', 'php', 'bash', 'lua', 'perl', 'haskell', 'swift', 'kotlin', 'sql'],
          },
          code: { type: 'string', description: 'The source code to execute' },
          stdin: { type: 'string', description: 'Optional stdin input for the program' },
        },
        required: ['language', 'code'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web for real-time information (DuckDuckGo, free). Use for news, prices, current events, latest docs, or anything not in training data.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
        },
        required: ['query'],
      },
    },
  },
];

// Provider presets — each provider has primary + fallback + vision + fast models
const PROVIDER_PRESETS = {
  groq: {
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    fallbackModels: [
      'llama-3.1-8b-instant',
      'gemma2-9b-it',
      'llama3-70b-8192',
      'llama3-8b-8192',
    ],
    visionModel: 'meta-llama/llama-4-scout-17b-16e-instruct',
    fastModel: 'llama-3.1-8b-instant',
    supportsVision: true,
    supportsStreaming: true,
    supportsTools: true,
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    fallbackModels: ['gpt-4o-mini', 'gpt-3.5-turbo'],
    visionModel: 'gpt-4o-mini',
    fastModel: 'gpt-4o-mini',
    supportsVision: true,
    supportsStreaming: true,
    supportsTools: true,
  },
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
    fallbackModels: [
      'qwen/qwen3-coder:free',
      'meta-llama/llama-3.2-3b-instruct:free',
    ],
    visionModel: 'meta-llama/llama-4-scout:free',
    fastModel: 'meta-llama/llama-3.2-3b-instruct:free',
    supportsVision: true,
    supportsStreaming: true,
    supportsTools: true,
  },
  together: {
    baseUrl: 'https://api.together.xyz/v1',
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free',
    fallbackModels: ['meta-llama/Llama-3.3-70B-Instruct-Turbo-Free'],
    visionModel: 'meta-llama/Llama-3.2-11B-Vision-Instruct-Turbo',
    fastModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo-Free',
    supportsVision: true,
    supportsStreaming: true,
    supportsTools: false,
  },
};

// Heuristic: classify if query is "complex" (needs big model) or "simple" (fast model ok)
function classifyQueryComplexity(message) {
  if (!message) return 'simple';
  const text = String(message).toLowerCase();
  const complexSignals = [
    /write.*(function|class|component|api|service|endpoint)/,
    /debug|bug|error|trace|stack.?trace/,
    /refactor|optimi[sz]e|architecture|design.?pattern/,
    /sql|database|schema|migration/,
    /regex|algorithm|data.?structure/,
    /explain|analyze|review/,
    /docker|kubernetes|deploy|ci\/cd/i,
    /\b(react|next\.js|vue|angular|svelte|express|nestjs|django|flask|fastapi|spring|laravel)\b/,
  ];
  const isLong = text.length > 250;
  const hasComplexSignal = complexSignals.some(r => r.test(text));
  return (hasComplexSignal || isLong) ? 'complex' : 'simple';
}

class AIService {
  constructor() {
    this.provider = null;
    this.baseUrl = null;
    this.apiKey = null;
    this.model = null;
    this.visionModel = null;
    this.fastModel = null;
    this.zai = null;
    this.initialized = false;
  }

  /**
   * Initialize the AI service — auto-detect provider from env vars
   */
  async initialize() {
    if (this.initialized) return;

    try {
      const provider = (process.env.AI_PROVIDER || '').toLowerCase();

      if (provider && provider !== 'zai' && PROVIDER_PRESETS[provider]) {
        const preset = PROVIDER_PRESETS[provider];
        this.provider = provider;
        this.baseUrl = process.env.AI_BASE_URL || preset.baseUrl;
        this.apiKey = process.env.AI_API_KEY;
        this.model = process.env.AI_MODEL || preset.defaultModel;
        this.visionModel = process.env.AI_VISION_MODEL || preset.visionModel || this.model;
        this.fastModel = process.env.AI_FAST_MODEL || preset.fastModel || this.model;

        if (!this.apiKey) {
          console.error(`⚠️ AI_PROVIDER=${provider} but AI_API_KEY is not set!`);
          console.error(`⚠️ Get your API key from ${this._getProviderKeyUrl(provider)}`);
          this.initialized = false;
          return;
        }

        console.log(`✅ AI Provider: ${provider}`);
        console.log(`✅ AI Base URL: ${this.baseUrl}`);
        console.log(`✅ AI Primary Model: ${this.model}`);
        console.log(`✅ AI Vision Model: ${this.visionModel}`);
        console.log(`✅ AI Fast Model: ${this.fastModel}`);
        this.initialized = true;
        return;
      }

      if (provider === 'custom' || (process.env.AI_BASE_URL && process.env.AI_API_KEY)) {
        this.provider = 'custom';
        this.baseUrl = process.env.AI_BASE_URL;
        this.apiKey = process.env.AI_API_KEY;
        this.model = process.env.AI_MODEL || 'gpt-3.5-turbo';
        this.visionModel = process.env.AI_VISION_MODEL || this.model;
        this.fastModel = process.env.AI_FAST_MODEL || this.model;

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

      // Fallback to Z.ai SDK (only works inside Z.ai infrastructure)
      console.log('📋 No AI_PROVIDER set. Trying Z.ai SDK (works only inside Z.ai infra)...');
      await this._initializeZAI();
    } catch (error) {
      console.error('⚠️ Failed to initialize AI service:', error.message);
      console.error('⚠️ Set AI_PROVIDER, AI_API_KEY env vars for AI features.');
      this.initialized = false;
    }
  }

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
   * Pick best model based on query complexity
   * - complex: primary model (e.g., llama-3.3-70b)
   * - simple: fast model (e.g., llama-3.1-8b-instant)
   */
  _pickModelForQuery(message) {
    const complexity = classifyQueryComplexity(message);
    const useModel = complexity === 'complex' ? this.model : (this.fastModel || this.model);
    if (useModel !== this.model) {
      console.log(`⚡ Multi-model routing: complexity=${complexity} → using ${useModel}`);
    }
    return useModel;
  }

  /**
   * Core OpenAI-compatible call with fallback, timeout, error parsing.
   * @param {Array} messages - chat messages
   * @param {Object} options - { model, temperature, max_tokens, tools, tool_choice, vision: bool }
   * @returns {Promise<string>} assistant content
   */
  async _callOpenAICompatible(messages, options = {}) {
    const url = `${this.baseUrl}/chat/completions`;
    const preset = PROVIDER_PRESETS[this.provider];

    // If caller specifies a model (e.g., for vision), use it as primary.
    // Otherwise pick based on query complexity (multi-model routing).
    const preferredModel = options.model || this._pickModelForQuery(options._userMessage);

    // Build fallback list. For vision requests, only use the vision model.
    let fallbackModels;
    if (options.vision) {
      fallbackModels = [this.visionModel, this.model];
    } else {
      fallbackModels = preset?.fallbackModels || [];
    }

    const modelsToTry = [preferredModel, ...fallbackModels];
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

      // Groq/OpenAI vision: add stream:false explicitly
      if (options.tools && preset?.supportsTools) {
        body.tools = options.tools;
        body.tool_choice = options.tool_choice || 'auto';
      }

      const maskedKey = this.apiKey
        ? `${this.apiKey.substring(0, 8)}...${this.apiKey.substring(this.apiKey.length - 4)}`
        : 'NOT_SET';

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);

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

          const shouldFallback = response.status === 429 ||
                                 response.status === 404 ||
                                 (response.status === 400 && /model/i.test(errorParsed));

          if (shouldFallback) {
            lastError = new Error(`[${this.provider}] ${response.status}: ${String(errorParsed).substring(0, 120)}`);
            continue;
          }

          if (response.status === 401 || response.status === 403) {
            throw new Error(`[${this.provider}] AUTH FAILED (${response.status}). API key invalid or expired. Key used: ${maskedKey}. ${String(errorParsed).substring(0, 100)}`);
          }

          throw new Error(`[${this.provider}] ${response.status}: ${String(errorParsed).substring(0, 200)}`);
        }

        const data = await response.json();
        if (model !== this.model) {
          console.log(`✅ Used fallback model: ${model}`);
        }

        // Handle tool calls (if any)
        const choice = data.choices?.[0];
        const msg = choice?.message;
        if (msg?.tool_calls && msg.tool_calls.length > 0) {
          return {
            content: msg.content || '',
            toolCalls: msg.tool_calls,
          };
        }

        const content = msg?.content;
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
   * Streaming call — returns async generator yielding text chunks.
   * Falls back to non-streaming if provider doesn't support SSE.
   * @param {Array} messages
   * @param {Object} options
   * @returns {AsyncGenerator<string>}
   */
  async *_callOpenAICompatibleStream(messages, options = {}) {
    const url = `${this.baseUrl}/chat/completions`;
    const preferredModel = options.model || this._pickModelForQuery(options._userMessage);

    const body = {
      model: preferredModel,
      messages,
      temperature: options.temperature ?? config.ai.temperature,
      max_tokens: options.max_tokens ?? config.ai.maxTokens,
      stream: true,
    };

    const maskedKey = this.apiKey
      ? `${this.apiKey.substring(0, 8)}...${this.apiKey.substring(this.apiKey.length - 4)}`
      : 'NOT_SET';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000); // 60s for streaming

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'Accept': 'text/event-stream',
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
        } catch (e) { /* keep raw */ }
        console.warn(`⚠️ [stream ${this.provider}] model=${preferredModel} status=${response.status} key=${maskedKey}`);
        throw new Error(`[${this.provider}] ${response.status}: ${String(errorParsed).substring(0, 200)}`);
      }

      if (!response.body) {
        // No stream body — fallback to non-streaming
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) yield content;
        return;
      }

      // Parse SSE stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;
          const dataStr = trimmed.slice(5).trim();
          if (dataStr === '[DONE]') return;

          try {
            const json = JSON.parse(dataStr);
            const delta = json.choices?.[0]?.delta?.content;
            if (delta) yield delta;
          } catch (e) {
            // skip malformed chunk
          }
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error(`[${this.provider}] Stream timeout (60s) for model ${preferredModel}`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Streaming chat — yields text chunks for real-time typing UX.
   * Falls back to non-streaming if provider is Z.ai or streaming fails.
   */
  async *streamChat(userMessage, history = [], mode = 'normal') {
    await this.ensureInitialized();

    const systemPrompt = this._getSystemPrompt(mode);
    const messages = this._buildMessages(systemPrompt, history, userMessage);

    if (this.provider === 'zai') {
      // Z.ai SDK doesn't support streaming — fallback
      const response = await this.chat(userMessage, history, mode);
      // Simulate streaming by chunking on word boundaries
      const words = response.split(/(\s+)/);
      let buffer = '';
      for (const w of words) {
        buffer += w;
        if (buffer.length >= 20) {
          yield buffer;
          buffer = '';
        }
      }
      if (buffer) yield buffer;
      return;
    }

    try {
      for await (const chunk of this._callOpenAICompatibleStream(messages, { _userMessage: userMessage })) {
        yield chunk;
      }
    } catch (err) {
      // If streaming fails, fallback to non-streaming
      console.warn(`⚠️ Stream failed, falling back to non-stream: ${err.message}`);
      const response = await this._callOpenAICompatible(messages, { _userMessage: userMessage });
      if (typeof response === 'string') {
        const words = response.split(/(\s+)/);
        let buffer = '';
        for (const w of words) {
          buffer += w;
          if (buffer.length >= 30) {
            yield buffer;
            buffer = '';
          }
        }
        if (buffer) yield buffer;
      }
    }
  }

  /**
   * Vision: analyze an image with a text prompt.
   * @param {string} imageBase64 - base64-encoded image data (no data URL prefix)
   * @param {string} mimeType - e.g., 'image/jpeg', 'image/png'
   * @param {string} prompt - user instruction
   * @param {Array} history - prior chat history
   * @returns {Promise<string>}
   */
  async analyzeImage(imageBase64, mimeType, prompt, history = []) {
    await this.ensureInitialized();

    const systemPrompt = `You are Glo Agent, a premium AI vision assistant. Analyze the image carefully.
${this._commonOutputRules()}`;

    const messages = [{ role: 'system', content: systemPrompt }];
    for (const msg of history) {
      messages.push({ role: msg.role, content: msg.content });
    }
    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: prompt || 'Analyze this image. Describe what you see, identify any code, errors, or UI elements.' },
        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
      ],
    });

    if (this.provider === 'zai') {
      // Z.ai SDK might support vision; try it
      try {
        const completion = await this.zai.chat.completions.create({
          messages,
          temperature: 0.4,
          max_tokens: config.ai.maxTokens,
        });
        return completion.choices[0]?.message?.content || 'Tidak ada respons dari AI.';
      } catch (e) {
        throw new Error(`Z.ai vision error: ${e.message}`);
      }
    }

    return await this._callOpenAICompatible(messages, {
      vision: true,
      model: this.visionModel,
      temperature: 0.4,
      _userMessage: prompt,
    });
  }

  /**
   * Get diagnostic status
   */
  getStatus() {
    return {
      initialized: this.initialized,
      provider: this.provider,
      baseUrl: this.baseUrl,
      model: this.model,
      visionModel: this.visionModel,
      fastModel: this.fastModel,
      hasApiKey: !!this.apiKey,
      apiKeyMasked: this.apiKey
        ? `${this.apiKey.substring(0, 8)}...${this.apiKey.substring(this.apiKey.length - 4)}`
        : 'NOT_SET',
      apiKeyLength: this.apiKey ? this.apiKey.length : 0,
      envProvider: process.env.AI_PROVIDER || '(not set)',
      envModel: process.env.AI_MODEL || '(using default)',
      envBaseUrl: process.env.AI_BASE_URL || '(using default)',
      envVisionModel: process.env.AI_VISION_MODEL || '(using default)',
      envFastModel: process.env.AI_FAST_MODEL || '(using default)',
    };
  }

  /**
   * Test AI connection with a tiny request
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
        return { ok: true, message: 'Z.ai SDK OK', model: 'zai' };
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
        message: `Connection OK. Response: ${String(response).substring(0, 50)}`,
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
      return await this._callOpenAICompatible(messages, { _userMessage: userMessage });
    } catch (error) {
      console.error('AI Chat Error:', error.message);
      throw error;
    }
  }

  /**
   * Chat with tool calling — AI can autonomously call run_code or web_search.
   * Loops up to 3 tool-call rounds, then returns final answer.
   *
   * Flow:
   * 1. Send messages + tools to AI
   * 2. If AI returns tool_calls, execute them and append tool results
   * 3. Re-send messages; AI produces final answer
   *
   * @returns {Promise<{content: string, toolHistory: Array}>}
   */
  async chatWithTools(userMessage, history = [], mode = 'normal') {
    await this.ensureInitialized();

    // Z.ai / together don't support tools — fallback to plain chat
    const preset = PROVIDER_PRESETS[this.provider];
    if (this.provider === 'zai' || !preset?.supportsTools) {
      const content = await this.chat(userMessage, history, mode);
      return { content, toolHistory: [] };
    }

    const systemPrompt = this._getSystemPrompt(mode) +
      '\n\nYou have access to tools: `run_code` (execute code in sandbox) and `web_search` (search the web). ' +
      'Use them automatically when the user asks to run code, test something, or asks about current/recent information. ' +
      'After tool results come back, summarize them in friendly Indonesian for the user.';
    const messages = this._buildMessages(systemPrompt, history, userMessage);
    const toolHistory = [];

    let rounds = 0;
    const MAX_ROUNDS = 4;

    while (rounds < MAX_ROUNDS) {
      rounds++;
      const result = await this._callOpenAICompatible(messages, {
        _userMessage: userMessage,
        tools: TOOL_DEFINITIONS,
        tool_choice: 'auto',
      });

      // No tool calls — final answer
      if (typeof result === 'string') {
        return { content: result, toolHistory };
      }

      // Tool calls — execute each, append results, loop
      if (result.toolCalls && result.toolCalls.length > 0) {
        // Append assistant message containing tool_calls
        messages.push({
          role: 'assistant',
          content: result.content || '',
          tool_calls: result.toolCalls,
        });

        for (const call of result.toolCalls) {
          const toolName = call.function?.name;
          let args = {};
          try { args = JSON.parse(call.function?.arguments || '{}'); } catch (e) { /* keep empty */ }

          console.log(`🔧 [tool] AI called: ${toolName}(${JSON.stringify(args).substring(0, 100)})`);
          const toolResult = await this._executeTool(toolName, args);
          toolHistory.push({ name: toolName, args, result: toolResult });

          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: JSON.stringify(toolResult).substring(0, 4000),
          });
        }
        // continue loop — AI will get tool results and respond
        continue;
      }

      return { content: result.content || 'Tidak ada respons.', toolHistory };
    }

    // Fallback after MAX_ROUNDS
    return {
      content: '⚠️ Maximum tool-call rounds reached. Coba sederhanakan pertanyaan Anda.',
      toolHistory,
    };
  }

  /**
   * Execute a tool call by name. Returns a result object.
   * @param {string} name - tool name
   * @param {Object} args - tool arguments
   * @returns {Promise<Object>}
   */
  async _executeTool(name, args) {
    try {
      if (name === 'run_code') {
        const result = await sandboxService.runCode(args.code, {
          language: args.language,
          stdin: args.stdin,
        });
        return {
          ok: result.ok,
          language: result.language,
          stdout: result.stdout.substring(0, 3000),
          stderr: result.stderr.substring(0, 1500),
          exitCode: result.exitCode,
          durationMs: result.durationMs,
          error: result.error,
        };
      }
      if (name === 'web_search') {
        const results = await webSearchService.search(args.query, 5);
        return {
          query: args.query,
          results: (results || []).slice(0, 5).map(r => ({
            title: r.title,
            url: r.url,
            snippet: (r.snippet || '').substring(0, 300),
          })),
        };
      }
      return { error: `Unknown tool: ${name}` };
    } catch (err) {
      return { error: `Tool ${name} failed: ${err.message}` };
    }
  }

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
      return await this._callOpenAICompatible(messages, { temperature: 0.4, _userMessage: description });
    } catch (error) {
      console.error('Code Generation Error:', error.message);
      throw error;
    }
  }

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
      return await this._callOpenAICompatible(messages, { temperature: 0.3, _userMessage: userMsg });
    } catch (error) {
      console.error('Debug Error:', error.message);
      throw error;
    }
  }

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
      return await this._callOpenAICompatible(messages, { temperature: 0.4, _userMessage: code });
    } catch (error) {
      console.error('Review Error:', error.message);
      throw error;
    }
  }

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
      return await this._callOpenAICompatible(messages, { temperature: 0.5, _userMessage: code });
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

  _commonOutputRules() {
    return `OUTPUT RULES:
- DO NOT use ### markdown headers.
- Use **bold** for labels instead of headers.
- Keep formatting flat and scannable.
- Respond in the same language the user uses.`;
  }

  _getSystemPrompt(mode) {
    const common = this._commonOutputRules();
    const modePrompts = {
      normal: `You are Glo Agent, a premium AI coding assistant. Help users write, review, debug, and explain code.\n\n${common}\n- At most one short intro paragraph before any code block.\n- Always use markdown code blocks with language identifier.`,
      code: `You are Glo Agent, a premium AI coding specialist. Focus on writing excellent, production-ready code. Always use markdown code blocks with language identifiers. ${common}`,
      debug: `You are Glo Agent, a premium AI debugging specialist. Find bugs efficiently. Always explain the root cause before providing the fix. ${common}`,
      review: `You are Glo Agent, a premium AI code review specialist. Focus on code quality, security, performance, and maintainability. ${common} Provide actionable, prioritized feedback.`,
      explain: `You are Glo Agent, a premium AI code explanation specialist. Break down code into simple, understandable parts. ${common} Use analogies when helpful. Be patient and clear.`,
    };
    return modePrompts[mode] || modePrompts.normal;
  }
}

const aiService = new AIService();
export default aiService;
