const EventEmitter = require('events');
const SanitizedLogger = require('./SanitizedLogger');

const logger = new SanitizedLogger('EventBus');

class EventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
  }

  // Predefined event constants
  static EVENTS = {
    WHATSAPP_CONNECTED: 'WHATSAPP_CONNECTED',
    WHATSAPP_DISCONNECTED: 'WHATSAPP_DISCONNECTED',
    SESSION_STATUS_CHANGED: 'SESSION_STATUS_CHANGED',
    QR_CODE_RECEIVED: 'QR_CODE_RECEIVED',
    MESSAGE_RECEIVED: 'MESSAGE_RECEIVED',
    AUTOMATION_STARTED: 'AUTOMATION_STARTED',
    AUTOMATION_STEP_CHANGED: 'AUTOMATION_STEP_CHANGED',
    AUTOMATION_COMPLETED: 'AUTOMATION_COMPLETED',
    HUMAN_HANDOFF: 'HUMAN_HANDOFF',
    TASK_CREATED: 'TASK_CREATED',
    TASK_UPDATED: 'TASK_UPDATED',
    TASK_COMPLETED: 'TASK_COMPLETED',
    AUTOMATION_ERROR: 'AUTOMATION_ERROR'
  };

  publish(event, payload = {}) {
    // Technical log only: do not log message contents
    const logPayload = { event };
    if (payload.contactId) logPayload.contactId = payload.contactId;
    if (payload.flowId) logPayload.flowId = payload.flowId;
    if (payload.stepId) logPayload.stepId = payload.stepId;
    if (payload.status) logPayload.status = payload.status;
    if (payload.taskId) logPayload.taskId = payload.taskId;

    logger.debug(`Event published: ${event}`, logPayload);
    this.emit(event, payload);
  }

  subscribe(event, listener) {
    this.on(event, listener);
    return () => this.off(event, listener);
  }
}

// Singleton event bus
const instance = new EventBus();
instance.EVENTS = EventBus.EVENTS;
module.exports = instance;

