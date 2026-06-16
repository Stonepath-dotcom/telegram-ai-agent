import config from '../../config/default.js';

/**
 * Rate Limiter Service - Prevents abuse by limiting requests per user
 */
class RateLimitService {
  constructor() {
    this.requests = new Map(); // userId -> { count, resetAt }
  }

  /**
   * Check if a user can make a request
   * @param {number} userId - Telegram user ID
   * @returns {{ allowed: boolean, remaining: number, retryAfter: number }}
   */
  checkLimit(userId) {
    const now = Date.now();
    const userReqs = this.requests.get(userId);

    if (!userReqs || now > userReqs.resetAt) {
      // New window
      this.requests.set(userId, {
        count: 1,
        resetAt: now + 60000, // 1 minute window
      });
      return {
        allowed: true,
        remaining: config.rateLimit.maxRequestsPerMinute - 1,
        retryAfter: 0,
      };
    }

    if (userReqs.count >= config.rateLimit.maxRequestsPerMinute) {
      return {
        allowed: false,
        remaining: 0,
        retryAfter: Math.ceil((userReqs.resetAt - now) / 1000),
      };
    }

    userReqs.count++;
    return {
      allowed: true,
      remaining: config.rateLimit.maxRequestsPerMinute - userReqs.count,
      retryAfter: 0,
    };
  }

  /**
   * Get remaining requests for a user
   * @param {number} userId
   * @returns {number}
   */
  getRemaining(userId) {
    const result = this.checkLimit(userId);
    // checkLimit increments count, so we need to adjust
    const userReqs = this.requests.get(userId);
    if (!userReqs) return config.rateLimit.maxRequestsPerMinute;
    return Math.max(0, config.rateLimit.maxRequestsPerMinute - userReqs.count);
  }
}

// Singleton instance
const rateLimitService = new RateLimitService();
export default rateLimitService;
