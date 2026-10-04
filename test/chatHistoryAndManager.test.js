const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const os = require('os');

const testDbPath = path.join(os.tmpdir(), `test-wa-chat-${Date.now()}.sqlite`);
const dbService = require('../src/database/database');
dbService.dbPath = testDbPath;
dbService.init();

const WhatsAppManager = require('../src/whatsapp/WhatsAppManager');
const ChatHistoryManager = require('../src/whatsapp/ChatHistoryManager');

WhatsAppManager.switchAdapter('mock');

test('ChatHistoryManager records and retrieves conversation messages', async () => {
  const contactId = '5511999887766@c.us';

  // 1. Inbound message
  ChatHistoryManager.addMessage(contactId, {
    id: 'test-m-1',
    body: 'Olá, gostaria de saber os preços',
    fromMe: false,
    timestamp: Date.now() - 2000
  });

  // 2. Outbound operator reply
  ChatHistoryManager.addMessage(contactId, {
    id: 'test-m-2',
    body: 'Olá! Nossos preços começam a partir de R$ 99',
    fromMe: true,
    timestamp: Date.now() - 1000
  });

  const history = ChatHistoryManager.getMessages(contactId);
  assert.strictEqual(history.length, 2, 'Should have 2 messages in memory');
  assert.strictEqual(history[0].body, 'Olá, gostaria de saber os preços');
  assert.strictEqual(history[0].fromMe, false);
  assert.strictEqual(history[1].body, 'Olá! Nossos preços começam a partir de R$ 99');
  assert.strictEqual(history[1].fromMe, true);
});

test('WhatsAppManager merges remote and local messages seamlessly', async () => {
  const contactId = '5511999887766@c.us';
  const messages = await WhatsAppManager.getChatMessages(contactId, 20);

  assert.ok(Array.isArray(messages));
  assert.ok(messages.length >= 2);
  assert.strictEqual(messages[0].id, 'test-m-1');
  assert.strictEqual(messages[0].direction, 'inbound');
  assert.strictEqual(messages[1].id, 'test-m-2');
  assert.strictEqual(messages[1].direction, 'outbound');
});
