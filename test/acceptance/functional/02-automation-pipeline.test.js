'use strict';
/**
 * FUNCIONAL - Pipeline completo de automacao e triagem
 * Fonte dos criterios: README (secoes "Linha do Tempo & Motor de Automacoes", "Princípios de Privacidade", Etapas 1-4).
 */
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const h = require('../helpers/harness');

describe('FUNC-PIPE | Pipeline de atendimento e triagem automatica', () => {
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

  it('PIPE-01 novo cliente recebe a mensagem inicial do menu principal', async () => {
    const phone = h.nextPhone();
    await h.customerSays(phone, 'Olá, gostaria de saber mais');

    const out = h.sentTo(phone);
    assert.equal(out.length, 1, 'Deveria ter enviado exatamente 1 mensagem inicial de boas-vindas');
    assert.match(out[0].text, /1\s*-\s*Orçamento/i, 'Mensagem deve conter opções do menu');

    const session = h.mod('automation/AutomationEngine').stateMachine.getSession(h.jid(phone));
    assert.ok(session, 'Sessão em memória criada');
    assert.equal(session.status, 'WAITING_INPUT');
    assert.equal(session.stepName, 'Menu Principal');
  });

  it('PIPE-02 cliente escolhe opção 1 (Orçamento) -> recebe mensagem da etapa e cria task HIGH', async () => {
    const phone = h.nextPhone();
    await h.customerSays(phone, 'Boa tarde');
    h.clearOutbox();

    await h.customerSays(phone, '1');

    const out = h.sentTo(phone);
    assert.equal(out.length, 1);
    assert.match(out[0].text, /orçamento/i);

    const session = h.mod('automation/AutomationEngine').stateMachine.getSession(h.jid(phone));
    assert.equal(session.status, 'WAITING_HUMAN');
    assert.equal(session.waitingHuman, true);

    const tasks = h.mod('tasks/TaskManager').getTasks({ status: 'PENDING' });
    const task = tasks.find((item) => item.contact_id === h.jid(phone));
    assert.ok(task, 'Task para operador deve ser criada');
    assert.equal(task.priority, 'HIGH');
    assert.match(task.title, /orçamento/i);
  });

  it('PIPE-03 opção por palavra-chave flexível ("suporte técnico") navega para etapa de suporte', async () => {
    const phone = h.nextPhone();
    await h.customerSays(phone, 'Oi');
    h.clearOutbox();

    await h.customerSays(phone, 'preciso de suporte urgente');

    const out = h.sentTo(phone);
    assert.equal(out.length, 1);
    assert.match(out[0].text, /suporte/i);

    const tasks = h.mod('tasks/TaskManager').getTasks({ status: 'PENDING' });
    const task = tasks.find((item) => item.contact_id === h.jid(phone));
    assert.ok(task, 'Task de suporte criada');
    assert.match(task.title, /suporte/i);
  });

  it('PIPE-04 respostas inválidas incrementam tentativas até o limite e transferem para humano', async () => {
    const phone = h.nextPhone();
    await h.customerSays(phone, 'Oi');
    h.clearOutbox();

    // Tentativa 1 inválida
    await h.customerSays(phone, 'abobrinha');
    let out = h.sentTo(phone);
    assert.equal(out.length, 1);
    assert.match(out[0].text, /identificar|tente novamente|1, 2 ou 3/i);

    // Tentativa 2 inválida
    h.clearOutbox();
    await h.customerSays(phone, 'cenoura');
    out = h.sentTo(phone);
    assert.equal(out.length, 1);

    // Tentativa 3 inválida (limite padrão = 3)
    h.clearOutbox();
    await h.customerSays(phone, 'batata');
    out = h.sentTo(phone);
    assert.ok(out.length >= 1, 'Deve enviar aviso de encaminhamento humano');

    const session = h.mod('automation/AutomationEngine').stateMachine.getSession(h.jid(phone));
    assert.equal(session.status, 'WAITING_HUMAN');

    const tasks = h.mod('tasks/TaskManager').getTasks({ status: 'PENDING' });
    const task = tasks.find((item) => item.contact_id === h.jid(phone));
    assert.ok(task, 'Task criada por exceder tentativas');
    assert.equal(task.type, 'MAX_ATTEMPTS_EXCEEDED');
  });

  it('PIPE-05 princípio "Não responder é melhor": enquanto WAITING_HUMAN o robô não envia mensagens repetidas', async () => {
    const phone = h.nextPhone();
    await h.customerSays(phone, 'Olá');
    await h.customerSays(phone, '1'); // vai para WAITING_HUMAN
    h.clearOutbox();

    // Cliente manda mais mensagens enquanto aguarda atendente humano
    await h.customerSays(phone, 'Tem alguém aí?');
    await h.customerSays(phone, 'Por favor me atendam');

    const out = h.sentTo(phone);
    assert.equal(out.length, 0, 'O robô JAMAIS deve responder automaticamente enquanto em WAITING_HUMAN');
  });

  it('PIPE-06 desativação global da automação ignora mensagens recebidas', async () => {
    await h.withSettings({ automation_enabled: 'false' }, async () => {
      const phone = h.nextPhone();
      await h.customerSays(phone, 'Alô');
      const out = h.sentTo(phone);
      assert.equal(out.length, 0, 'Nenhuma resposta quando automação está desabilitada');
      const session = h.mod('automation/AutomationEngine').stateMachine.getSession(h.jid(phone));
      assert.equal(session, null, 'Nenhuma sessão criada');
    });
  });

  it('PIPE-07 horário fora de expediente envia mensagem informativa e cria task se configurado', async () => {
    // Configuramos horário de modo que o momento atual esteja fora
    const closedSchedule = {
      0: { open: '00:00', close: '00:00', enabled: false },
      1: { open: '00:00', close: '00:00', enabled: false },
      2: { open: '00:00', close: '00:00', enabled: false },
      3: { open: '00:00', close: '00:00', enabled: false },
      4: { open: '00:00', close: '00:00', enabled: false },
      5: { open: '00:00', close: '00:00', enabled: false },
      6: { open: '00:00', close: '00:00', enabled: false }
    };

    await h.withSettings({
      business_hours_enabled: 'true',
      business_hours_schedule: JSON.stringify(closedSchedule),
      out_of_hours_action: 'reply_and_task',
      out_of_hours_message: 'Fechado no momento. Retornaremos em breve.'
    }, async () => {
      const phone = h.nextPhone();
      await h.customerSays(phone, 'Quero comprar');

      const out = h.sentTo(phone);
      assert.equal(out.length, 1);
      assert.match(out[0].text, /fechado no momento/i);

      const tasks = h.mod('tasks/TaskManager').getTasks({ status: 'PENDING' });
      const task = tasks.find((t) => t.contact_id === h.jid(phone));
      assert.ok(task, 'Task criada fora do expediente');
      assert.match(task.title, /fora do horário/i);
    });
  });
});
