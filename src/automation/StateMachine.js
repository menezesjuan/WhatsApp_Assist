const LoopDetector = require('../utils/LoopDetector');
const SanitizedLogger = require('../utils/SanitizedLogger');
const config = require('../config/config');

const logger = new SanitizedLogger('StateMachine');

class StateMachine {
  static STATES = {
    NEW: 'NEW',
    AUTOMATION_ACTIVE: 'AUTOMATION_ACTIVE',
    WAITING_INPUT: 'WAITING_INPUT',
    PROCESSING_INPUT: 'PROCESSING_INPUT',
    WAITING_HUMAN: 'WAITING_HUMAN',
    COMPLETED: 'COMPLETED',
    HANDOFF: 'HANDOFF',
    DISABLED: 'DISABLED'
  };

  constructor() {
    // Ephemeral in-memory sessions: contactId -> Session object
    // Principle: Purely in-memory, NO message text is ever stored!
    this.sessions = new Map();
    this.loopDetector = new LoopDetector({
      maxTransitions: config.safety.maxTransitionsPerContact
    });

    // Cleanup interval for stale sessions
    this.cleanupInterval = setInterval(() => this.cleanupStaleSessions(), 60 * 1000);
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Retrieves or initializes a session for a contact
   * @param {string} contactId
   * @param {string} contactName
   * @returns {object} Session
   */
  getOrCreateSession(contactId, contactName = '') {
    if (!contactId) return null;

    let session = this.sessions.get(contactId);
    if (!session) {
      session = {
        contactId,
        contactName,
        flowId: null,
        flowName: null,
        stepId: null,
        stepName: null,
        status: StateMachine.STATES.NEW,
        invalidAttempts: 0,
        createdAt: Date.now(),
        lastActivity: Date.now(),
        waitingHuman: false,
        completed: false
      };
      this.sessions.set(contactId, session);
      logger.info('Created new contact session in memory', { contactId, status: session.status });
    } else {
      session.lastActivity = Date.now();
      if (contactName && !session.contactName) {
        session.contactName = contactName;
      }
    }
    return session;
  }

  /**
   * Gets session if exists
   * @param {string} contactId
   */
  getSession(contactId) {
    return this.sessions.get(contactId) || null;
  }

  /**
   * Transitions a session to a new state and step
   * @param {string} contactId
   * @param {string} targetState
   * @param {object} [metadata] { flowId, flowName, stepId, stepName }
   * @returns {{ success: boolean, hasLoop?: boolean, reason?: string }}
   */
  transition(contactId, targetState, metadata = {}) {
    const session = this.getSession(contactId);
    if (!session) {
      return { success: false, reason: 'Session not found' };
    }

    const previousState = session.status;
    const previousStep = session.stepId;

    // Check loop detection when transitioning to a step
    if (metadata.stepId !== undefined && metadata.stepId !== null) {
      const loopCheck = this.loopDetector.recordAndCheck(contactId, metadata.stepId);
      if (loopCheck.hasLoop) {
        logger.warn(`Loop detector triggered for contact ${contactId}: ${loopCheck.reason}`);
        // Force transition to WAITING_HUMAN
        session.status = StateMachine.STATES.WAITING_HUMAN;
        session.waitingHuman = true;
        session.lastActivity = Date.now();
        return {
          success: false,
          hasLoop: true,
          reason: loopCheck.reason
        };
      }
    }

    session.status = targetState;
    if (metadata.flowId !== undefined) session.flowId = metadata.flowId;
    if (metadata.flowName !== undefined) session.flowName = metadata.flowName;
    if (metadata.stepId !== undefined) session.stepId = metadata.stepId;
    if (metadata.stepName !== undefined) session.stepName = metadata.stepName;
    session.lastActivity = Date.now();

    if (targetState === StateMachine.STATES.WAITING_HUMAN || targetState === StateMachine.STATES.HANDOFF) {
      session.waitingHuman = true;
    } else if (targetState === StateMachine.STATES.COMPLETED) {
      session.completed = true;
    }

    logger.info(`State transition: [${previousState}] -> [${targetState}] (Step: ${previousStep} -> ${session.stepId})`, {
      contactId,
      status: targetState,
      stepId: session.stepId
    });

    return { success: true };
  }

  /**
   * Increments invalid input attempts
   */
  incrementInvalidAttempts(contactId) {
    const session = this.getSession(contactId);
    if (session) {
      session.invalidAttempts = (session.invalidAttempts || 0) + 1;
      return session.invalidAttempts;
    }
    return 0;
  }

  /**
   * Resets invalid input attempts count
   */
  resetInvalidAttempts(contactId) {
    const session = this.getSession(contactId);
    if (session) {
      session.invalidAttempts = 0;
    }
  }

  /**
   * Manually hands off chat to human operator (operator taking over conversation)
   */
  takeover(contactId) {
    const session = this.getOrCreateSession(contactId);
    session.status = StateMachine.STATES.HANDOFF;
    session.waitingHuman = true;
    session.lastActivity = Date.now();
    this.loopDetector.reset(contactId);
    logger.info('Operator took over session manually', { contactId });
    return true;
  }

  /**
   * Resets or restarts automation for a contact
   */
  resetSession(contactId) {
    this.sessions.delete(contactId);
    this.loopDetector.reset(contactId);
    logger.info('Session reset for contact', { contactId });
  }

  /**
   * Returns list of currently active in-memory sessions (technical metadata only)
   */
  getActiveSessions() {
    return Array.from(this.sessions.values()).map(s => ({
      contactId: s.contactId,
      contactName: s.contactName,
      flowId: s.flowId,
      flowName: s.flowName,
      stepId: s.stepId,
      stepName: s.stepName,
      status: s.status,
      waitingHuman: s.waitingHuman,
      lastActivity: s.lastActivity,
      createdAt: s.createdAt
    }));
  }

  /**
   * Purges sessions older than TTL
   */
  cleanupStaleSessions(ttlMs = config.safety.contactSessionTtlMs) {
    const now = Date.now();
    for (const [contactId, session] of this.sessions.entries()) {
      if (now - session.lastActivity > ttlMs) {
        this.sessions.delete(contactId);
        this.loopDetector.reset(contactId);
      }
    }
    this.loopDetector.cleanup(ttlMs);
  }
}

module.exports = StateMachine;
