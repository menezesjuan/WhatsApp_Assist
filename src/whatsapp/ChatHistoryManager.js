const SanitizedLogger = require('../utils/SanitizedLogger');

const logger = new SanitizedLogger('ChatHistoryManager');

class ChatHistoryManager {
  constructor() {
    this.chats = new Map(); // contactId -> Array<Message>
  }

  addMessage(contactId, message) {
    if (!contactId || !message) return;
    const cleanId = contactId.trim();

    if (!this.chats.has(cleanId)) {
      this.chats.set(cleanId, []);
    }

    const list = this.chats.get(cleanId);
    // Avoid exact duplicate IDs
    const fromMe = Boolean(message.fromMe);
    const direction = message.direction || (fromMe ? 'outbound' : 'inbound');
    const exists = list.some(m => m.id === message.id);
    if (!exists) {
      list.push({
        id: message.id || String(Date.now() + Math.random()),
        body: message.body || '',
        fromMe,
        direction,
        timestamp: message.timestamp || Date.now(),
        senderName: message.senderName || (fromMe ? 'Operador' : 'Cliente')
      });

      // Keep up to 100 recent messages per contact
      if (list.length > 100) {
        list.shift();
      }
    }
  }

  getMessages(contactId) {
    if (!contactId) return [];
    return this.chats.get(contactId.trim()) || [];
  }

  getAllChats() {
    const result = [];
    for (const [contactId, msgs] of this.chats.entries()) {
      const lastMsg = msgs[msgs.length - 1];
      result.push({
        contactId,
        lastMessage: lastMsg?.body || '',
        lastTimestamp: lastMsg?.timestamp || 0,
        messagesCount: msgs.length
      });
    }
    result.sort((a, b) => b.lastTimestamp - a.lastTimestamp);
    return result;
  }
}

const instance = new ChatHistoryManager();
module.exports = instance;
