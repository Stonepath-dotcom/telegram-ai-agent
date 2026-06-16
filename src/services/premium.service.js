/**
 * Premium Tier Service
 *
 * Mock premium gating (no real Stripe integration yet — but the structure is here).
 * Set PREMIUM_USER_IDS env var to comma-separated Telegram user IDs to grant premium.
 * Example: PREMIUM_USER_IDS=123456,789012
 *
 * Free tier limits:
 * - 30 messages/day
 * - 5 vision requests/day
 * - 5 web searches/day
 * - 3 voice ASR/day
 * - TTS disabled
 * - Fast model only (no llama-3.3-70b)
 *
 * Premium tier:
 * - Unlimited everything
 * - Vision, voice, search unlimited
 * - TTS enabled
 * - Primary model (llama-3.3-70b-versatile)
 *
 * Future: integrate real Stripe webhook → set PREMIUM_USER_IDS dynamically.
 */

import fs from 'fs';
import path from 'path';
import memoryService from './memory.service.js';

const DATA_DIR = process.env.MEMORY_DIR || path.join(process.cwd(), 'data');
const USAGE_FILE = path.join(DATA_DIR, 'usage.json');

const FREE_LIMITS = {
  messagesPerDay: 50,
  visionPerDay: 5,
  searchPerDay: 10,
  voiceASRPerDay: 5,
  voiceTTSPerDay: 0,  // disabled for free
};

class PremiumService {
  constructor() {
    this.usage = null;
    this._load();
    this._premiumIds = new Set(
      (process.env.PREMIUM_USER_IDS || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
    );
    // ADMIN_USERS are auto-premium
    (process.env.ADMIN_USERS || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .forEach(id => this._premiumIds.add(id));
  }

  _load() {
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      if (fs.existsSync(USAGE_FILE)) {
        this.usage = JSON.parse(fs.readFileSync(USAGE_FILE, 'utf8'));
      } else {
        this.usage = {};
      }
    } catch (e) {
      console.warn(`⚠️ Usage load failed: ${e.message}`);
      this.usage = {};
    }
  }

  _persist() {
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmp = USAGE_FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.usage, null, 2));
      fs.renameSync(tmp, USAGE_FILE);
    } catch (e) {
      console.warn(`⚠️ Usage persist failed: ${e.message}`);
    }
  }

  _today() {
    return new Date().toISOString().slice(0, 10);
  }

  _getUserDay(userId, feature) {
    const key = `${userId}.${this._today()}.${feature}`;
    if (this.usage[key] == null) {
      this.usage[key] = 0;
    }
    return key;
  }

  isPremium(userId) {
    return this._premiumIds.has(String(userId));
  }

  /**
   * Check + increment counter for a feature.
   * Returns { allowed, used, limit, remaining, premium }
   */
  checkAndIncrement(userId, feature) {
    if (this.isPremium(userId)) {
      return { allowed: true, used: 0, limit: Infinity, remaining: Infinity, premium: true };
    }
    const limit = FREE_LIMITS[`${feature}PerDay`];
    if (limit === undefined) {
      // Unknown feature — allow
      return { allowed: true, used: 0, limit: Infinity, remaining: Infinity, premium: false };
    }
    const key = this._getUserDay(userId, feature);
    const used = this.usage[key] || 0;
    if (used >= limit) {
      return { allowed: false, used, limit, remaining: 0, premium: false };
    }
    this.usage[key] = used + 1;
    this._persist();
    return { allowed: true, used: used + 1, limit, remaining: limit - used - 1, premium: false };
  }

  /**
   * Peek without incrementing
   */
  peekUsage(userId, feature) {
    if (this.isPremium(userId)) {
      return { used: 0, limit: Infinity, remaining: Infinity, premium: true };
    }
    const limit = FREE_LIMITS[`${feature}PerDay`];
    const key = `${userId}.${this._today()}.${feature}`;
    const used = this.usage[key] || 0;
    return { used, limit, remaining: Math.max(0, limit - used), premium: false };
  }

  getStats(userId) {
    return {
      premium: this.isPremium(userId),
      messages: this.peekUsage(userId, 'messages'),
      vision: this.peekUsage(userId, 'vision'),
      search: this.peekUsage(userId, 'search'),
      voiceASR: this.peekUsage(userId, 'voiceASR'),
      voiceTTS: this.peekUsage(userId, 'voiceTTS'),
    };
  }

  formatStatsMessage(userId) {
    const s = this.getStats(userId);
    if (s.premium) {
      return `✨ *Premium Active* ✨\n\n💎 Tier: Premium\n🔓 All features unlocked\n♾️ Unlimited usage\n\n_Thank you for supporting Glo Agent_`;
    }
    const fmt = (n) => n === Infinity ? '∞' : String(n);
    return `🆓 *Free Tier*\n\n` +
      `💬 Messages  : ${fmt(s.messages.used)}/${fmt(s.messages.limit)}\n` +
      `👁️ Vision    : ${fmt(s.vision.used)}/${fmt(s.vision.limit)}\n` +
      `🔍 Search    : ${fmt(s.search.used)}/${fmt(s.search.limit)}\n` +
      `🎤 Voice ASR : ${fmt(s.voiceASR.used)}/${fmt(s.voiceASR.limit)}\n` +
      `🔊 Voice TTS : ${fmt(s.voiceTTS.used)}/${fmt(s.voiceTTS.limit)}\n\n` +
      `_Upgrade ke Premium untuk akses unlimited_`;
  }
}

const premiumService = new PremiumService();
export default premiumService;
