/**
 * IdempotencyGuard
 * In-memory deduplication cache with strict TTL.
 * Prevents processing or responding to duplicate incoming events/messages.
 * Principle: Never persists event keys to disk or DB. Entries expire and are discarded.
 */

class IdempotencyGuard {
  constructor(defaultTtlMs = 60 * 1000) {
    this.defaultTtlMs = defaultTtlMs;
    // Map of key -> expiration timestamp
    this.seenKeys = new Map();

    // Periodic sweep every 30s to keep memory minimal
    this.sweepInterval = setInterval(() => this.sweep(), 30 * 1000);
    if (this.sweepInterval.unref) {
      this.sweepInterval.unref();
    }
  }

  /**
   * Checks if an event is duplicate. If not seen, records it and returns false.
   * If already seen and not expired, returns true.
   * @param {string} key Unique identifier (e.g. messageId or hash of contact+timestamp)
   * @param {number} [ttlMs] Custom TTL in ms
   * @returns {boolean} true if already processed, false if new
   */
  isDuplicate(key, ttlMs = this.defaultTtlMs) {
    if (!key) return false;
    const now = Date.now();
    const expiry = this.seenKeys.get(key);

    if (expiry && expiry > now) {
      return true; // Already processed within TTL
    }

    // Record with TTL
    this.seenKeys.set(key, now + ttlMs);
    return false;
  }

  sweep() {
    const now = Date.now();
    for (const [key, expiry] of this.seenKeys.entries()) {
      if (expiry <= now) {
        this.seenKeys.delete(key);
      }
    }
  }

  destroy() {
    clearInterval(this.sweepInterval);
    this.seenKeys.clear();
  }
}

module.exports = IdempotencyGuard;
