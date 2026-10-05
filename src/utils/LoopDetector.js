/**
 * LoopDetector
 * Tracks state transition histories per contact in-memory to prevent infinite loops,
 * cycle ping-pongs (A -> B -> A -> B -> A), and runaway automatic responses.
 */

class LoopDetector {
  constructor(options = {}) {
    this.maxTransitions = options.maxTransitions || 15;
    this.maxConsecutiveCycles = options.maxConsecutiveCycles || 2;
    // Map of contactId -> { transitions: Array<{ stepId, timestamp }>, count: number }
    this.contactHistory = new Map();
  }

  /**
   * Records a transition and checks for loop conditions
   * @param {string} contactId
   * @param {number|string} nextStepId
   * @returns {{ hasLoop: boolean, reason?: string }}
   */
  recordAndCheck(contactId, nextStepId) {
    if (!contactId) return { hasLoop: false };

    let record = this.contactHistory.get(contactId);
    if (!record) {
      record = { transitions: [], count: 0 };
      this.contactHistory.set(contactId, record);
    }

    record.count += 1;
    record.transitions.push({
      stepId: String(nextStepId),
      timestamp: Date.now()
    });
    // Only the last few steps matter for cycle detection; `count` tracks the total
    if (record.transitions.length > 10) {
      record.transitions.shift();
    }

    // 1. Max total transitions check
    if (record.count > this.maxTransitions) {
      return {
        hasLoop: true,
        reason: `Exceeded maximum transitions limit (${this.maxTransitions})`
      };
    }

    // 2. Cycle detection: check if last 5 steps alternate e.g. [A, B, A, B, A]
    const steps = record.transitions.map(t => t.stepId);
    if (steps.length >= 5) {
      const last5 = steps.slice(-5);
      if (last5[0] === last5[2] && last5[2] === last5[4] &&
          last5[1] === last5[3] && last5[0] !== last5[1]) {
        return {
          hasLoop: true,
          reason: `Detected repeating 2-step oscillation cycle: [${last5[0]} <-> ${last5[1]}]`
        };
      }
    }

    // 3. Repeated single step bounce: [A, A, A, A]
    if (steps.length >= 4) {
      const last4 = steps.slice(-4);
      if (last4.every(s => s === last4[0])) {
        return {
          hasLoop: true,
          reason: `Detected repeated self-loop on step: ${last4[0]}`
        };
      }
    }

    return { hasLoop: false };
  }

  /**
   * Resets contact tracking upon completion or manual handoff
   * @param {string} contactId
   */
  reset(contactId) {
    this.contactHistory.delete(contactId);
  }

  /**
   * Clean stale contacts older than 2 hours
   */
  cleanup(maxAgeMs = 2 * 60 * 60 * 1000) {
    const now = Date.now();
    for (const [contactId, record] of this.contactHistory.entries()) {
      const last = record.transitions[record.transitions.length - 1];
      if (last && now - last.timestamp > maxAgeMs) {
        this.contactHistory.delete(contactId);
      }
    }
  }
}

module.exports = LoopDetector;
