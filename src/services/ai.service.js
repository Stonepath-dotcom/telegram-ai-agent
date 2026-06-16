import ZAI from 'z-ai-web-dev-sdk';
import config from '../../config/default.js';

/**
 * AI Service - Handles all AI interactions using z-ai-web-dev-sdk
 */
class AIService {
  constructor() {
    this.zai = null;
    this.initialized = false;
  }

  /**
   * Initialize the ZAI SDK
   * Creates .z-ai-config from env vars if needed (for Railway/production)
   */
  async initialize() {
    if (this.initialized) return;
    try {
      const fs = await import('fs');
      const path = await import('path');
      const os = await import('os');

      // Check if .z-ai-config exists in project dir or home dir
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
        } catch (e) {
          // Permission denied or other FS error, skip
        }
      }

      // If no config file found, create one from env vars
      if (!configExists) {
        const zaiBaseUrl = process.env.ZAI_BASE_URL;
        const zaiApiKey = process.env.ZAI_API_KEY;
        const zaiToken = process.env.ZAI_TOKEN;

        if (zaiBaseUrl && zaiApiKey) {
          console.log('📋 Creating .z-ai-config from environment variables...');
          const configData = JSON.stringify({
            baseUrl: zaiBaseUrl,
            apiKey: zaiApiKey,
            ...(zaiToken ? { token: zaiToken } : {}),
            chatId: process.env.ZAI_CHAT_ID || '',
            userId: process.env.ZAI_USER_ID || '',
          }, null, 2);

          // Write to project directory (Railway container is writable)
          try {
            const configPath = path.join(process.cwd(), '.z-ai-config');
            fs.writeFileSync(configPath, configData);
            console.log(`✅ Created config at: ${configPath}`);
          } catch (writeErr) {
            // If project dir is read-only, try /tmp
            const tmpPath = '/tmp/.z-ai-config';
            fs.writeFileSync(tmpPath, configData);
            process.env.ZAI_CONFIG_PATH = tmpPath;
            console.log(`✅ Created config at: ${tmpPath}`);
          }
        } else {
          console.error('⚠️ No ZAI config file found and no ZAI_BASE_URL/ZAI_API_KEY env vars set!');
          console.error('⚠️ Bot will start but AI features will not work until config is provided.');
          this.initialized = false;
          return; // Don't crash - bot can still respond to non-AI commands
        }
      }

      // Initialize SDK (it will read the config file)
      this.zai = await ZAI.create();
      this.initialized = true;
      console.log('✅ ZAI SDK initialized successfully');
    } catch (error) {
      console.error('⚠️ Failed to initialize ZAI SDK:', error.message);
      console.error('⚠️ Bot will start but AI features will not work.');
      this.initialized = false;
      // Don't throw - allow bot to start without AI
    }
  }

  /**
   * Ensure AI is initialized before use
   */
  async ensureInitialized() {
    if (!this.initialized) {
      await this.initialize();
    }
    if (!this.initialized) {
      throw new Error('AI service is not available. Please configure ZAI_BASE_URL and ZAI_API_KEY environment variables.');
    }
  }

  /**
   * General chat completion
   * @param {string} userMessage - The user's message
   * @param {Array} history - Conversation history
   * @param {string} mode - Chat mode (normal, code, debug, review, explain)
   * @returns {string} AI response
   */
  async chat(userMessage, history = [], mode = 'normal') {
    await this.ensureInitialized();

    const systemPrompt = this._getSystemPrompt(mode);
    const messages = this._buildMessages(systemPrompt, history, userMessage);

    try {
      const completion = await this.zai.chat.completions.create({
        messages,
        temperature: config.ai.temperature,
        max_tokens: config.ai.maxTokens,
      });

      return completion.choices[0]?.message?.content || 'Maaf, saya tidak bisa memproses permintaan Anda.';
    } catch (error) {
      console.error('AI Chat Error:', error.message);
      throw new Error(`AI Error: ${error.message}`);
    }
  }

  /**
   * Generate code based on description
   * @param {string} description - What code to generate
   * @param {string} language - Programming language (optional)
   * @param {Array} history - Conversation history
   * @returns {string} Generated code with explanation
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
      const completion = await this.zai.chat.completions.create({
        messages,
        temperature: 0.4, // Lower temperature for code generation
        max_tokens: config.ai.maxTokens,
      });

      return completion.choices[0]?.message?.content || 'Gagal generate kode.';
    } catch (error) {
      console.error('Code Generation Error:', error.message);
      throw new Error(`Code Generation Error: ${error.message}`);
    }
  }

  /**
   * Debug code - find and fix bugs
   * @param {string} code - Code to debug
   * @param {string} errorMsg - Error message (optional)
   * @param {Array} history - Conversation history
   * @returns {string} Debug analysis and fix
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
      const completion = await this.zai.chat.completions.create({
        messages,
        temperature: 0.3, // Very low temperature for debugging
        max_tokens: config.ai.maxTokens,
      });

      return completion.choices[0]?.message?.content || 'Gagal menganalisis kode.';
    } catch (error) {
      console.error('Debug Error:', error.message);
      throw new Error(`Debug Error: ${error.message}`);
    }
  }

  /**
   * Review code - analyze quality, security, performance
   * @param {string} code - Code to review
   * @param {Array} history - Conversation history
   * @returns {string} Code review
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
      const completion = await this.zai.chat.completions.create({
        messages,
        temperature: 0.4,
        max_tokens: config.ai.maxTokens,
      });

      return completion.choices[0]?.message?.content || 'Gagal mereview kode.';
    } catch (error) {
      console.error('Review Error:', error.message);
      throw new Error(`Review Error: ${error.message}`);
    }
  }

  /**
   * Explain code - break down complex logic
   * @param {string} code - Code to explain
   * @param {Array} history - Conversation history
   * @returns {string} Code explanation
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
      const completion = await this.zai.chat.completions.create({
        messages,
        temperature: 0.5,
        max_tokens: config.ai.maxTokens,
      });

      return completion.choices[0]?.message?.content || 'Gagal menjelaskan kode.';
    } catch (error) {
      console.error('Explain Error:', error.message);
      throw new Error(`Explain Error: ${error.message}`);
    }
  }

  /**
   * Build messages array for the AI
   */
  _buildMessages(systemPrompt, history, userMessage) {
    const messages = [
      { role: 'system', content: systemPrompt },
    ];

    // Add conversation history
    for (const msg of history) {
      messages.push({
        role: msg.role,
        content: msg.content,
      });
    }

    // Add current user message
    messages.push({ role: 'user', content: userMessage });

    return messages;
  }

  /**
   * Get system prompt based on mode
   */
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

// Singleton instance
const aiService = new AIService();
export default aiService;
