const WhatsAppAdapter = require('./WhatsAppAdapter');
const WhatsAppWebAdapter = require('./WhatsAppWebAdapter');
const MockWhatsAppAdapter = require('./MockWhatsAppAdapter');
const ChatHistoryManager = require('./ChatHistoryManager');
const EventBus = require('../utils/EventBus');
const config = require('../config/config');
const SanitizedLogger = require('../utils/SanitizedLogger');

const logger = new SanitizedLogger('WhatsAppManager');

class WhatsAppManager {
  constructor() {
    this.adapterType = config.whatsapp.adapterType;
    this.adapter = null;
    this._initAdapter();
  }

  _initAdapter(type = this.adapterType) {
    if (this.adapter) {
      try {
        this.adapter.disconnect();
      } catch (err) {
        // ignore
      }
    }

    this.adapterType = type;
    logger.info(`Initializing WhatsApp adapter: ${type}`);

    if (type === 'mock') {
      this.adapter = new MockWhatsAppAdapter({ autoConnect: true });
    } else {
      this.adapter = new WhatsAppWebAdapter();
    }

    this._bindAdapterEvents();
  }

  _bindAdapterEvents() {
    this.adapter.onConnectionChange((status, details) => {
      logger.info(`WhatsApp connection status changed to: ${status}`);

      EventBus.publish(EventBus.EVENTS.SESSION_STATUS_CHANGED, {
        status,
        details,
        qr: this.adapter.getQRCode(),
        clientInfo: this.adapter.getClientInfo(),
        adapterType: this.adapterType
      });

      if (status === WhatsAppAdapter.STATUS.CONNECTED) {
        EventBus.publish(EventBus.EVENTS.WHATSAPP_CONNECTED, {
          clientInfo: this.adapter.getClientInfo()
        });
      } else if (status === WhatsAppAdapter.STATUS.DISCONNECTED || status === WhatsAppAdapter.STATUS.SESSION_LOST) {
        EventBus.publish(EventBus.EVENTS.WHATSAPP_DISCONNECTED, {
          status,
          details
        });
      }
    });

    this.adapter.onIncomingMessage((payload) => {
      // Record message in in-memory chat history
      ChatHistoryManager.addMessage(payload.from, {
        id: payload.id,
        body: payload.body,
        fromMe: false,
        timestamp: payload.timestamp,
        senderName: payload.fromName
      });

      // Dispatches MESSAGE_RECEIVED in memory to the automation engine
      EventBus.publish(EventBus.EVENTS.MESSAGE_RECEIVED, payload);

      // Dispatches live chat real-time notification
      EventBus.publish('CHAT_MESSAGE_RECEIVED', {
        contactId: payload.from,
        contactName: payload.fromName,
        message: {
          id: payload.id,
          body: payload.body,
          fromMe: false,
          timestamp: payload.timestamp
        }
      });
    });
  }

  async connect() {
    return await this.adapter.connect();
  }

  async disconnect() {
    return await this.adapter.disconnect();
  }

  getStatus() {
    return this.adapter ? this.adapter.getStatus() : WhatsAppAdapter.STATUS.DISCONNECTED;
  }

  getQRCode() {
    return this.adapter ? this.adapter.getQRCode() : null;
  }

  getClientInfo() {
    return this.adapter ? this.adapter.getClientInfo() : null;
  }

  getAdapterType() {
    return this.adapterType;
  }

  switchAdapter(type) {
    if (type !== 'web' && type !== 'mock') {
      throw new Error(`Invalid adapter type: ${type}. Allowed: 'web', 'mock'`);
    }
    this._initAdapter(type);
    return { success: true, adapterType: this.adapterType, status: this.getStatus() };
  }

  async sendMessage(to, text) {
    if (!this.adapter) {
      throw new Error('No WhatsApp adapter initialized.');
    }
    const result = await this.adapter.sendMessage(to, text);
    if (result && result.success) {
      const msgObj = {
        id: result.id || String(Date.now()),
        body: text,
        fromMe: true,
        timestamp: Date.now(),
        senderName: 'Operador'
      };
      ChatHistoryManager.addMessage(to, msgObj);
      EventBus.publish('CHAT_MESSAGE_SENT', {
        contactId: to,
        message: msgObj
      });
    }
    return result;
  }

  async getChatMessages(contactId, limit = 50) {
    let remoteMsgs = [];
    if (this.adapter && typeof this.adapter.getChatMessages === 'function') {
      try {
        remoteMsgs = await this.adapter.getChatMessages(contactId, limit);
      } catch (err) {
        logger.warn(`Could not get remote messages: ${err.message}`);
      }
    }

    const localMsgs = ChatHistoryManager.getMessages(contactId);

    const map = new Map();
    for (const m of remoteMsgs) {
      map.set(m.id, m);
    }
    for (const m of localMsgs) {
      if (!map.has(m.id)) {
        map.set(m.id, m);
      }
    }

    const merged = Array.from(map.values()).map(m => ({
      ...m,
      fromMe: Boolean(m.fromMe),
      direction: m.direction || (m.fromMe ? 'outbound' : 'inbound')
    }));
    merged.sort((a, b) => a.timestamp - b.timestamp);
    return merged;
  }

  async getProfilePicUrl(contactId) {
    if (this.adapter && typeof this.adapter.getProfilePicUrl === 'function') {
      return await this.adapter.getProfilePicUrl(contactId);
    }
    return null;
  }

  // Simulation helper for sandbox/mock testing
  simulateIncoming(phone, text, name) {
    if (this.adapter instanceof MockWhatsAppAdapter) {
      this.adapter.simulateIncoming(phone, text, name);
      return { success: true };
    }
    // Even if in web mode, we can directly dispatch to EventBus for testing
    const jid = phone.includes('@') ? phone : `${phone.replace(/\D/g, '')}@c.us`;
    const msgPayload = {
      id: `sim-${Date.now()}`,
      from: jid,
      fromName: name || 'Contato Simulado',
      body: text,
      timestamp: Date.now(),
      isGroup: false
    };

    ChatHistoryManager.addMessage(jid, {
      id: msgPayload.id,
      body: msgPayload.body,
      fromMe: false,
      timestamp: msgPayload.timestamp,
      senderName: msgPayload.fromName
    });

    EventBus.publish(EventBus.EVENTS.MESSAGE_RECEIVED, msgPayload);
    EventBus.publish('CHAT_MESSAGE_RECEIVED', {
      contactId: jid,
      contactName: msgPayload.fromName,
      message: {
        id: msgPayload.id,
        body: msgPayload.body,
        fromMe: false,
        timestamp: msgPayload.timestamp
      }
    });

    return { success: true };
  }
}

const instance = new WhatsAppManager();
module.exports = instance;
