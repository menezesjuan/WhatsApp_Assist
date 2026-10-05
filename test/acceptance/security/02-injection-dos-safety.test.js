'use strict';
/**
 * SEGURANÇA - Injeções, DoS, Path Traversal, Anti-Loop e Idempotência
 * Fonte dos critérios: README (seções "Princípios de Privacidade & Segurança", "Anti-Loop e Idempotência").
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('../helpers/harness');

describe('SEC-INJECTION-SAFETY | Robustez contra injeções, travamentos e loops', () => {
  let t;
  before(async () => {
    t = await h.start();
    h.connectMock();
  });
  after(async () => {
    await h.stop();
  });

  it('SEC-01 Headers de segurança HTTP estão presentes na resposta', async () => {
    const res = await t.api('GET', '/');
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal(res.headers['x-frame-options'], 'SAMEORIGIN');
    assert.ok(res.headers['x-xss-protection']);
  });

  it('SEC-02 Proteção contra DoS por corpo excessivo: requisições > 100KB retornam 413', async () => {
    const hugePayload = {
      name: 'Fluxo Gigante',
      description: 'A'.repeat(120 * 1024) // 120KB
    };

    const res = await t.api('POST', '/api/automations', hugePayload);
    assert.equal(res.status, 413, 'Deveria retornar 413 Payload Too Large');
  });

  it('SEC-03 Proteção contra Path Traversal em arquivos estáticos', async () => {
    const traversalAttempts = [
      '/../../package.json',
      '/..%2f..%2fpackage.json',
      '/....//....//package.json',
      '/../../src/backend/server.js'
    ];

    for (const attempt of traversalAttempts) {
      const res = await t.raw({ path: attempt });
      assert.notEqual(res.status, 200, `Path traversal permitiu acesso via ${attempt}`);
      assert.equal(res.text.includes('"dependencies"'), false, 'Não deve expor o package.json');
    }
  });

  it('SEC-04 SQL Injection em busca ou filtros não quebra a aplicação nem vaza dados', async () => {
    const sqlInjections = [
      "1' OR '1'='1",
      "'; DROP TABLE tasks; --",
      "1 UNION SELECT null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null--"
    ];

    for (const sqli of sqlInjections) {
      const res = await t.api('GET', `/api/tasks?status=${encodeURIComponent(sqli)}`);
      // Deve responder sem 500 fatal e sem erro de sintaxe SQL exposto
      assert.notEqual(res.status, 500, `SQL Injection causou HTTP 500 com payload: ${sqli}`);
      assert.equal(h.leaksInternals(res.text), false, 'Não deve expor stack trace ou erro interno de SQL');
    }
  });

  it('SEC-05 Idempotência: mensagem com ID duplicado dentro do TTL é descartada', async () => {
    const phone = h.nextPhone();
    const duplicateId = `msg-dup-${Date.now()}`;

    h.clearOutbox();

    // Primeira emissão da mensagem
    h.publishInbound({
      id: duplicateId,
      from: h.jid(phone),
      body: '1'
    });

    await h.sleep(200);
    const count1 = h.sentTo(phone).length;

    // Segunda emissão da MESMA mensagem com o mesmo ID
    h.publishInbound({
      id: duplicateId,
      from: h.jid(phone),
      body: '1'
    });

    await h.sleep(200);
    const count2 = h.sentTo(phone).length;

    assert.equal(count2, count1, 'Mensagem duplicada com mesmo ID não deve gerar nova resposta (idempotência violada)');
  });

  it('SEC-06 Anti-Loop: oscilação contínua de etapas (A <-> B) aciona bloqueio e cria task URGENT', async () => {
    const contactId = h.jid(h.nextPhone());
    const stateMachine = h.mod('automation/AutomationEngine').stateMachine;
    stateMachine.resetSession(contactId);

    // Simula transições rápidas oscilantes: 101 -> 102 -> 101 -> 102 -> 101
    stateMachine.getOrCreateSession(contactId, 'Cliente Loop');
    stateMachine.transition(contactId, 'AUTOMATION_ACTIVE', { stepId: 101, stepName: 'Etapa A' });
    stateMachine.transition(contactId, 'AUTOMATION_ACTIVE', { stepId: 102, stepName: 'Etapa B' });
    stateMachine.transition(contactId, 'AUTOMATION_ACTIVE', { stepId: 101, stepName: 'Etapa A' });
    stateMachine.transition(contactId, 'AUTOMATION_ACTIVE', { stepId: 102, stepName: 'Etapa B' });

    const result = stateMachine.transition(contactId, 'AUTOMATION_ACTIVE', { stepId: 101, stepName: 'Etapa A' });

    assert.equal(result.hasLoop, true, 'Detector de loop deve disparar para oscilação repetida');
    assert.match(result.reason, /oscillation|repeating/i);

    const session = stateMachine.getSession(contactId);
    assert.equal(session.status, 'WAITING_HUMAN', 'Em caso de loop, a máquina de estados deve forçar WAITING_HUMAN');
  });
});
