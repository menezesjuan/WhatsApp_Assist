'use strict';
/**
 * FUNCIONAL - Central de Tasks (Kanban) e Live Chat Integrado
 * Fonte dos criterios: README (secoes 1 "WhatsApp Web Integrado", 2 "Central de Tasks & Kanban", Etapas 4-6).
 */
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('../helpers/harness');

describe('FUNC-KANBAN-CHAT | Central de Tasks e Chat Integrado', () => {
  let t;
  before(async () => {
    t = await h.start();
    h.connectMock();
  });
  after(async () => {
    await h.stop();
  });

  beforeEach(() => {
    h.clearOutbox();
  });

  it('KANBAN-01 transição de status de Task: PENDING -> IN_PROGRESS -> RESOLVED', async () => {
    const task = h.makeTask({ title: 'Cliente aguarda retorno', priority: 'MEDIUM' });

    // 1. Iniciar atendimento (IN_PROGRESS)
    const patch1 = await t.api('PATCH', `/api/tasks/${task.id}/status`, {
      status: 'IN_PROGRESS',
      assigned_to: 'Operador Carlos'
    });
    assert.equal(patch1.status, 200);
    assert.equal(patch1.json.task.status, 'IN_PROGRESS');
    assert.equal(patch1.json.task.assigned_to, 'Operador Carlos');

    // 2. Concluir atendimento (RESOLVED)
    const patch2 = await t.api('PATCH', `/api/tasks/${task.id}/status`, {
      status: 'RESOLVED'
    });
    assert.equal(patch2.status, 200);
    assert.equal(patch2.json.task.status, 'RESOLVED');

    // Validar filtro por status
    const resolvedList = await t.api('GET', '/api/tasks?status=RESOLVED');
    assert.ok(resolvedList.json.tasks.some((tItem) => tItem.id === task.id));
  });

  it('KANBAN-02 takeover de Task pausa automação para o contato (HANDOFF)', async () => {
    const phone = h.nextPhone();
    const task = h.makeTask({ contactId: h.jid(phone) });

    const takeover = await t.api('POST', `/api/tasks/${task.id}/takeover`, {
      operator_name: 'Operador Roberto'
    });
    assert.equal(takeover.status, 200);
    assert.match(takeover.json.whatsappWebUrl, /https:\/\/web\.whatsapp\.com\/send\?phone=55/);

    const session = h.mod('automation/AutomationEngine').stateMachine.getSession(h.jid(phone));
    assert.ok(session, 'Sessão existe');
    assert.equal(session.status, 'HANDOFF', 'Automação deve estar pausada em HANDOFF');
  });

  it('CHAT-01 operador envia mensagem pelo Live Chat integrado sob supervisão explícita', async () => {
    const phone = h.nextPhone();
    const contactJid = h.jid(phone);

    const sendRes = await t.api('POST', `/api/whatsapp/chats/${encodeURIComponent(contactJid)}/messages`, {
      message: 'Olá! Sou o atendente humano, como posso te ajudar hoje?'
    });
    assert.equal(sendRes.status, 200);
    assert.equal(sendRes.json.success, true);

    const out = h.sentTo(contactJid);
    assert.equal(out.length, 1);
    assert.equal(out[0].text, 'Olá! Sou o atendente humano, como posso te ajudar hoje?');

    // Histórico de mensagens do chat deve conter a mensagem enviada
    const chatMsgs = await t.api('GET', `/api/whatsapp/chats/${encodeURIComponent(contactJid)}/messages`);
    assert.equal(chatMsgs.status, 200);
    assert.ok(chatMsgs.json.messages.some((m) => m.fromMe === true && m.body.includes('atendente humano')));
  });

  it('CHAT-02 bloqueio de envio quando WhatsApp está desconectado', async () => {
    h.disconnectMock();
    const phone = h.nextPhone();

    const sendRes = await t.api('POST', `/api/whatsapp/chats/${encodeURIComponent(h.jid(phone))}/messages`, {
      message: 'Tentativa de mensagem offline'
    });
    assert.equal(sendRes.status, 400);
    assert.match(sendRes.json.error, /não conectado/i);

    // Reconecta para testes subsequentes
    h.connectMock();
  });

  it('CHAT-03 listagem de conversas ativas (/api/whatsapp/chats) une sessões e tarefas pendentes', async () => {
    const phoneA = h.nextPhone();
    h.makeTask({ contactId: h.jid(phoneA), contactName: 'Cliente Tarefa' });

    const chatsRes = await t.api('GET', '/api/whatsapp/chats');
    assert.equal(chatsRes.status, 200);
    assert.ok(Array.isArray(chatsRes.json.chats));
    const found = chatsRes.json.chats.find((c) => c.contactId === h.jid(phoneA));
    assert.ok(found, 'Contato com tarefa deve estar na lista de conversas');
    assert.equal(found.name, 'Cliente Tarefa');
  });

  it('KANBAN-03 URLs do WhatsApp Web e App usam formato de discagem internacional 55', async () => {
    const rawNumber = '11987654321';
    const task = h.makeTask({ contactId: `${rawNumber}@c.us` });

    const fetched = (await t.api('GET', `/api/tasks?limit=50`)).json.tasks.find((tItem) => tItem.id === task.id);
    assert.ok(fetched);
    assert.equal(fetched.whatsappWebUrl, `https://web.whatsapp.com/send?phone=55${rawNumber}`);
    assert.equal(fetched.whatsappAppUrl, `https://api.whatsapp.com/send?phone=55${rawNumber}`);
  });
});
