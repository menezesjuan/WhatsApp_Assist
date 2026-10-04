const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const os = require('os');
const fs = require('fs');

// Create temporary database for testing
const testDbPath = path.join(os.tmpdir(), `test-wa-assist-${Date.now()}.sqlite`);
const dbService = require('../src/database/database');
dbService.dbPath = testDbPath;
dbService.init();

const AutomationEngine = require('../src/automation/AutomationEngine');
const StateMachine = require('../src/automation/StateMachine');
const TaskManager = require('../src/tasks/TaskManager');
const WhatsAppManager = require('../src/whatsapp/WhatsAppManager');

// Switch WhatsAppManager to mock adapter
WhatsAppManager.switchAdapter('mock');

test('End-to-End Automation Flow & Privacy Verification', async () => {
  const contactPhone = '5511988887777@c.us';

  // 1. Initial message from customer
  await AutomationEngine.handleIncomingMessage({
    id: 'msg-001',
    from: contactPhone,
    fromName: 'Cliente Pedro',
    body: 'Olá',
    isGroup: false
  });

  let session = AutomationEngine.stateMachine.getSession(contactPhone);
  assert.ok(session, 'Session should be created in-memory');
  assert.strictEqual(session.status, StateMachine.STATES.WAITING_INPUT);
  assert.strictEqual(session.stepName, 'Menu Principal');

  // 2. Customer selects Option 1 ("Orçamento") after pause
  await new Promise(r => setTimeout(r, 550));
  await AutomationEngine.handleIncomingMessage({
    id: 'msg-002',
    from: contactPhone,
    fromName: 'Cliente Pedro',
    body: '1',
    isGroup: false
  });

  session = AutomationEngine.stateMachine.getSession(contactPhone);
  assert.strictEqual(session.status, StateMachine.STATES.WAITING_HUMAN, 'Should halt automation and wait for human');
  assert.strictEqual(session.waitingHuman, true);

  // Verify task was generated for human intervention
  const tasks = TaskManager.getTasks({ status: 'PENDING' });
  const task = tasks.find(t => t.contact_id === contactPhone);
  assert.ok(task, 'Task should have been generated');
  assert.strictEqual(task.title, 'Cliente solicitou orçamento');
  assert.strictEqual(task.priority, 'HIGH');
  assert.strictEqual(task.flow_name, 'Primeiro Atendimento');

  // 3. Customer sends another message while in WAITING_HUMAN
  // Automation should NOT respond (Principle: "Não responder é melhor")
  await new Promise(r => setTimeout(r, 550));
  await AutomationEngine.handleIncomingMessage({
    id: 'msg-003',
    from: contactPhone,
    fromName: 'Cliente Pedro',
    body: 'Preciso de um site para minha loja',
    isGroup: false
  });

  // State remains WAITING_HUMAN or HANDOFF (automation halted)
  session = AutomationEngine.stateMachine.getSession(contactPhone);
  assert.ok(session.status === StateMachine.STATES.WAITING_HUMAN || session.status === StateMachine.STATES.HANDOFF);
  assert.strictEqual(session.waitingHuman, true);

  // 4. Operator takes over conversation manually
  const takeoverRes = TaskManager.updateTaskStatus(task.id, 'IN_PROGRESS', 'Operador Maria');
  AutomationEngine.stateMachine.takeover(contactPhone);

  session = AutomationEngine.stateMachine.getSession(contactPhone);
  assert.strictEqual(session.status, StateMachine.STATES.HANDOFF);
  assert.strictEqual(takeoverRes.status, 'IN_PROGRESS');

  // 5. PRIVACY AUDIT: Verify SQLite database schema contains NO message storage
  const tables = dbService.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  const tableNames = tables.map(t => t.name);

  const forbiddenTables = ['messages', 'conversations', 'chat_history', 'message_logs', 'whatsapp_messages'];
  for (const ft of forbiddenTables) {
    assert.strictEqual(tableNames.includes(ft), false, `Forbidden table ${ft} found!`);
  }

  // Verify tasks table does NOT have message columns
  const taskCols = dbService.prepare('PRAGMA table_info(tasks)').all().map(c => c.name.toLowerCase());
  const forbiddenCols = ['message', 'content', 'body', 'text', 'chat_history'];
  for (const fc of forbiddenCols) {
    assert.strictEqual(taskCols.includes(fc), false, `Forbidden column ${fc} found in tasks table!`);
  }

  // Cleanup test DB
  dbService.close();
  try {
    fs.unlinkSync(testDbPath);
  } catch {
    // ignore
  }
});
