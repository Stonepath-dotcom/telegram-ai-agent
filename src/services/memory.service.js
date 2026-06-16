/**
 * Long-term Memory Service (file-backed JSON storage)
 *
 * Stores per-user persistent preferences and facts that survive restarts.
 * No SQLite dependency — pure JSON file, atomic writes via fs.rename.
 *
 * Memory shape per user:
 * {
 *   preferences: { language, stack, level, name, timezone },
 *   facts: [ { ts, content } ],          // things to remember
 *   createdAt, updatedAt
 * }
 *
 * Public API:
 * - get(userId)
 * - savePreference(userId, key, value)
 * - getPreference(userId, key)
 * - addFact(userId, content)
 * - getFacts(userId, limit)
 * - clear(userId)
 * - buildMemoryContext(userId)  // → string to inject into system prompt
 * - detectAndStoreFromMessage(userId, userMessage)  // heuristics
 */

import fs from 'fs';
import path from 'path';

const DATA_DIR = process.env.MEMORY_DIR || path.join(process.cwd(), 'data');
const MEMORY_FILE = path.join(DATA_DIR, 'memory.json');

class MemoryService {
  constructor() {
    this.cache = null;
    this._load();
  }

  _load() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(MEMORY_FILE)) {
        const raw = fs.readFileSync(MEMORY_FILE, 'utf8');
        this.cache = JSON.parse(raw);
      } else {
        this.cache = {};
      }
    } catch (e) {
      console.warn(`⚠️ Memory load failed, starting fresh: ${e.message}`);
      this.cache = {};
    }
  }

  _persist() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      // Atomic write via tmp + rename
      const tmp = MEMORY_FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.cache, null, 2));
      fs.renameSync(tmp, MEMORY_FILE);
    } catch (e) {
      console.warn(`⚠️ Memory persist failed: ${e.message}`);
    }
  }

  _ensure(userId) {
    const key = String(userId);
    if (!this.cache[key]) {
      this.cache[key] = {
        preferences: {},
        facts: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    }
    return this.cache[key];
  }

  get(userId) {
    return this.cache[String(userId)] || null;
  }

  savePreference(userId, key, value) {
    const u = this._ensure(userId);
    u.preferences[key] = value;
    u.updatedAt = Date.now();
    this._persist();
  }

  getPreference(userId, key, fallback = null) {
    const u = this.get(userId);
    return u?.preferences?.[key] ?? fallback;
  }

  addFact(userId, content) {
    if (!content || content.length < 3) return;
    const u = this._ensure(userId);
    // Limit facts to last 50
    u.facts.push({ ts: Date.now(), content: content.substring(0, 500) });
    if (u.facts.length > 50) u.facts = u.facts.slice(-50);
    u.updatedAt = Date.now();
    this._persist();
  }

  getFacts(userId, limit = 10) {
    const u = this.get(userId);
    if (!u?.facts?.length) return [];
    return u.facts.slice(-limit);
  }

  clear(userId) {
    delete this.cache[String(userId)];
    this._persist();
  }

  /**
   * Build a memory context string to inject into the AI system prompt.
   * Lets the AI "remember" the user across sessions.
   */
  buildMemoryContext(userId) {
    const u = this.get(userId);
    if (!u) return '';
    const parts = [];
    if (u.preferences && Object.keys(u.preferences).length > 0) {
      parts.push(`User preferences: ${JSON.stringify(u.preferences)}`);
    }
    if (u.facts && u.facts.length > 0) {
      const factsStr = u.facts.slice(-5).map(f => `- ${f.content}`).join('\n');
      parts.push(`Things to remember about this user:\n${factsStr}`);
    }
    return parts.length ? parts.join('\n\n') : '';
  }

  /**
   * Heuristic detection of memorable info from a user message.
   * Catches things like:
   *   - "My name is X" / "Nama saya X"
   *   - "I use Python/React/Next.js"
   *   - "Remember that ..."
   *   - "Don't forget ..."
   */
  detectAndStoreFromMessage(userId, message) {
    if (!message || typeof message !== 'string') return;
    const text = message.trim();

    // Name detection (English + Indonesian)
    const nameMatch = text.match(/\b(?:my name is|nama saya|saya |perkenalkan,? saya|namaku|aku )\s+([A-Za-z][A-Za-z\s]{1,30})/i);
    if (nameMatch && nameMatch[1]) {
      const name = nameMatch[1].trim().split(/\s+/).slice(0, 2).join(' ');
      this.savePreference(userId, 'name', name);
      this.addFact(userId, `User's name is ${name}`);
      return;
    }

    // Stack/language detection
    const stackMatch = text.match(/\b(?:I use|saya pakai|saya gunakan|pakai|gue pakai)\s+([A-Za-z0-9._\-+# ]{2,40})/i);
    if (stackMatch && stackMatch[1]) {
      const stack = stackMatch[1].trim().replace(/\s+(?:to|untuk|for).*/, '');
      const existing = this.getPreference(userId, 'stack', '');
      if (!existing.toLowerCase().includes(stack.toLowerCase())) {
        const newStack = existing ? `${existing}, ${stack}` : stack;
        this.savePreference(userId, 'stack', newStack);
        this.addFact(userId, `User uses ${stack}`);
      }
      return;
    }

    // Explicit "remember" / "don't forget"
    const rememberMatch = text.match(/\b(?:remember that|ingat bahwa|jangan lupa|catat ya|please remember|tolong ingat)\s+(.{5,200})/i);
    if (rememberMatch && rememberMatch[1]) {
      this.addFact(userId, rememberMatch[1].trim());
      return;
    }

    // Skill level hint
    const levelMatch = text.match(/\b(?:I'm a|saya seorang|gue seorang|saya newbie|saya pemula|saya expert|saya mahir)\s+([A-Za-z\s]{3,40})/i);
    if (levelMatch && levelMatch[1]) {
      this.savePreference(userId, 'level', levelMatch[1].trim());
      this.addFact(userId, `User described themselves as: ${levelMatch[1].trim()}`);
    }
  }
}

const memoryService = new MemoryService();
export default memoryService;
