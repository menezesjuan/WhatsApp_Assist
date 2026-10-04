const EventBus = require('../utils/EventBus');
const SanitizedLogger = require('../utils/SanitizedLogger');

const logger = new SanitizedLogger('NotificationManager');

class NotificationManager {
  constructor() {
    this.wsClients = new Set();
    this._bindEvents();
  }

  registerClient(ws) {
    this.wsClients.add(ws);
    logger.info(`WebSocket client connected. Active connections: ${this.wsClients.size}`);

    ws.on('close', () => {
      this.wsClients.delete(ws);
      logger.info(`WebSocket client disconnected. Active connections: ${this.wsClients.size}`);
    });
  }

  broadcast(type, data = {}) {
    const payload = JSON.stringify({
      type,
      data,
      timestamp: Date.now()
    });

    for (const ws of this.wsClients) {
      if (ws.readyState === 1) { // OPEN
        try {
          ws.send(payload);
        } catch (err) {
          logger.error(`Error sending message to WebSocket client: ${err.message}`);
        }
      }
    }
  }

  _bindEvents() {
    // Broadcast all conceptual events in real time to frontend UI
    EventBus.subscribe(EventBus.EVENTS.SESSION_STATUS_CHANGED, (data) => {
      this.broadcast('SESSION_STATUS_CHANGED', data);
    });

    EventBus.subscribe(EventBus.EVENTS.WHATSAPP_CONNECTED, (data) => {
      this.broadcast('WHATSAPP_CONNECTED', data);
    });

    EventBus.subscribe(EventBus.EVENTS.WHATSAPP_DISCONNECTED, (data) => {
      this.broadcast('WHATSAPP_DISCONNECTED', data);
    });

    EventBus.subscribe(EventBus.EVENTS.AUTOMATION_STARTED, (data) => {
      this.broadcast('AUTOMATION_STARTED', data);
    });

    EventBus.subscribe(EventBus.EVENTS.AUTOMATION_COMPLETED, (data) => {
      this.broadcast('AUTOMATION_COMPLETED', data);
    });

    EventBus.subscribe(EventBus.EVENTS.HUMAN_HANDOFF, (data) => {
      this.broadcast('HUMAN_HANDOFF', data);
    });

    EventBus.subscribe(EventBus.EVENTS.TASK_CREATED, (data) => {
      this.broadcast('TASK_CREATED', data);
    });

    EventBus.subscribe(EventBus.EVENTS.TASK_UPDATED, (data) => {
      this.broadcast('TASK_UPDATED', data);
    });

    EventBus.subscribe(EventBus.EVENTS.TASK_COMPLETED, (data) => {
      this.broadcast('TASK_COMPLETED', data);
    });

    EventBus.subscribe(EventBus.EVENTS.AUTOMATION_ERROR, (data) => {
      this.broadcast('AUTOMATION_ERROR', data);
    });

    EventBus.subscribe('CHAT_MESSAGE_RECEIVED', (data) => {
      this.broadcast('CHAT_MESSAGE_RECEIVED', data);
    });

    EventBus.subscribe('CHAT_MESSAGE_SENT', (data) => {
      this.broadcast('CHAT_MESSAGE_SENT', data);
    });
  }
}

const instance = new NotificationManager();
module.exports = instance;
