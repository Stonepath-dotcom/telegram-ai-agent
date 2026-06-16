/**
 * Default Configuration for Telegram AI Agent Bot
 * 
 * IMPORTANT: Set these environment variables before running:
 * - BOT_TOKEN: Your Telegram Bot Token (from @BotFather)
 * - ZAI_API_KEY: Your Z-AI API Key (if required)
 */

export default {
  // Telegram Bot Configuration
  bot: {
    token: process.env.BOT_TOKEN || 'YOUR_TELEGRAM_BOT_TOKEN_HERE',
    username: process.env.BOT_USERNAME || 'AICodingAgentBot',
  },

  // AI Configuration
  ai: {
    model: process.env.AI_MODEL || 'default',
    maxTokens: parseInt(process.env.MAX_TOKENS || '4096'),
    temperature: parseFloat(process.env.TEMPERATURE || '0.7'),
    systemPrompt: `You are an expert AI coding agent inside a Telegram bot. You are highly skilled in:

1. **Writing Code** - Any language: Python, JavaScript, TypeScript, Go, Rust, Java, C++, etc.
2. **Debugging** - Find bugs, trace errors, suggest fixes
3. **Code Review** - Analyze code quality, security, performance
4. **Explaining Code** - Break down complex logic step by step
5. **Architecture** - Design systems, suggest patterns, plan features
6. **DevOps** - Docker, CI/CD, cloud deployment

Rules:
- Always provide working, production-quality code
- Use proper formatting with markdown code blocks
- Include language identifier in code blocks (e.g. \`\`\`python)
- Be concise but thorough
- When debugging, explain the root cause before giving the fix
- When writing code, add helpful comments
- Respond in the same language the user uses
- If the user sends code, analyze it carefully before responding`,
  },

  // Chat History Configuration
  history: {
    maxMessages: parseInt(process.env.MAX_HISTORY || '20'),  // Max messages per conversation
    ttlSeconds: parseInt(process.env.HISTORY_TTL || '3600'), // 1 hour TTL
  },

  // Rate Limiting
  rateLimit: {
    maxRequestsPerMinute: parseInt(process.env.RATE_LIMIT || '10'),
    cooldownSeconds: parseInt(process.env.COOLDOWN || '5'),
  },

  // Admin users (Telegram user IDs) - can use admin commands
  adminUsers: (process.env.ADMIN_USERS || '').split(',').filter(Boolean).map(Number),
};
