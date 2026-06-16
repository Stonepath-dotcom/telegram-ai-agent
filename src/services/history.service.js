import config from '../../config/default.js';

/**
 * Chat History Service - Manages conversation history per user
 * Supports TTL-based auto-cleanup
 */
class HistoryService {
  constructor() {
    this.histories = new Map(); // userId -> { messages: [], lastActivity: timestamp }
    this.cleanupInterval = null;
    this._startCleanup();
  }

  /**
   * Get conversation history for a user
   * @param {number} userId - Telegram user ID
   * @returns {Array} Message history
   */
  getHistory(userId) {
    const entry = this.histories.get(userId);
    if (!entry) return [];

    // Check TTL
    const now = Date.now();
    if (now - entry.lastActivity > config.history.ttlSeconds * 1000) {
      this.histories.delete(userId);
      return [];
    }

    return entry.messages;
  }

  /**
   * Add a message to user's history
   * @param {number} userId - Telegram user ID
   * @param {string} role - 'user' or 'assistant'
   * @param {string} content - Message content
   */
  addMessage(userId, role, content) {
    let entry = this.histories.get(userId);

    if (!entry) {
      entry = { messages: [], lastActivity: Date.now() };
      this.histories.set(userId, entry);
    }

    entry.messages.push({ role, content });
    entry.lastActivity = Date.now();

    // Trim to max messages (keep system prompt out, only conversation)
    if (entry.messages.length > config.history.maxMessages) {
      entry.messages = entry.messages.slice(-config.history.maxMessages);
    }
  }

  /**
   * Clear history for a user
   * @param {number} userId - Telegram user ID
   */
  clearHistory(userId) {
    this.histories.delete(userId);
  }

  /**
   * Get user's current mode
   * @param {number} userId - Telegram user ID
   * @returns {string} Current mode
   */
  getMode(userId) {
    const entry = this.histories.get(userId);
    return entry?.mode || 'normal';
  }

  /**
   * Set user's current mode
   * @param {number} userId - Telegram user ID
   * @param {string} mode - Mode to set
   */
  setMode(userId, mode) {
    let entry = this.histories.get(userId);
    if (!entry) {
      entry = { messages: [], lastActivity: Date.now() };
      this.histories.set(userId, entry);
    }
    entry.mode = mode;
    entry.lastActivity = Date.now();
  }

  /**
   * Get active conversations count
   * @returns {number}
   */
  getActiveCount() {
    return this.histories.size;
  }

  /**
   * Start periodic cleanup of expired conversations
   */
  _startCleanup() {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [userId, entry] of this.histories) {
        if (now - entry.lastActivity > config.history.ttlSeconds * 1000) {
          this.histories.delete(userId);
        }
      }
    }, 60000); // Clean every minute

    // Don't prevent Node from exiting
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Stop cleanup interval
   */
  stopCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// Singleton instance
const historyService = new HistoryService();
export default historyService;
