'use strict';
/**
 * USABILIDADE & CONFORMIDADE OPERACIONAL
 * Fonte dos critérios: README (seções 3 "Dashboard Operacional", "Supervisão Rápida", "Regra Absoluta NUNCA ENVIA SOZINHO", "Notificações em Tempo Real").
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('../helpers/harness');

describe('USABILITY-COMPLIANCE | Conformidade Operacional e Usabilidade em Tempo Real', () => {
  let t;
  before(async () => {
    t = await h.start();
    h.connectMock();
  });
  after(async () => {
    await h.stop();
  });

  it('COMPL-01 Regra Absoluta "NUNCA ENVIA SOZINHO": Modo manual_click retém mensagens automáticas', async () => {
    await h.withSettings({ reply_mode: 'manual_click' }, async () => {
      h.clearOutbox();
      const phone = h.nextPhone();

      // Cliente manda mensagem, mas estamos em modo manual_click
      await h.customerSays(phone, 'Olá');

      const out = h.sentTo(phone);
      assert.equal(out.length, 0, 'No modo manual_click, NENHUMA mensagem pode ser enviada automaticamente sem o clique do operador');

      // Mas a sessão e o fluxo avançam normalmente para triagem
      const session = h.mod('automation/AutomationEngine').stateMachine.getSession(h.jid(phone));
      assert.ok(session, 'Sessão foi criada e aguarda interação do operador');
    });
  });

  it('COMPL-02 WebSocket emite notificações em tempo real para criação e atualização de tarefas', async () => {
    const wsClient = t.openWs();
    await wsClient.opened;

    const cur = wsClient.cursor();
    const phone = h.nextPhone();

    // Criamos uma tarefa diretamente
    const task = h.makeTask({
      contactId: h.jid(phone),
      title: 'Tarefa Teste WebSocket'
    });

    const event = await wsClient.next('TASK_CREATED', {
      from: cur,
      pred: (e) => e.data && e.data.task && e.data.task.id === task.id,
      timeout: 3000
    });

    assert.ok(event, 'Evento TASK_CREATED recebido pelo cliente WebSocket');
    assert.equal(event.data.task.title, 'Tarefa Teste WebSocket');
    assert.ok(typeof event.data.pendingCount === 'number');

    wsClient.close();
  });

  it('COMPL-03 WebSocket emite evento SESSION_STATUS_CHANGED e WHATSAPP_CONNECTED / DISCONNECTED', async () => {
    const wsClient = t.openWs();
    await wsClient.opened;

    const cur = wsClient.cursor();

    // Desconecta o adaptador
    h.disconnectMock();
    const disconnectEvent = await wsClient.next('WHATSAPP_DISCONNECTED', { from: cur, timeout: 3000 });
    assert.ok(disconnectEvent, 'Evento de desconexão recebido pelo WebSocket');

    // Reconecta o adaptador
    const cur2 = wsClient.cursor();
    h.connectMock();
    const connectEvent = await wsClient.next('WHATSAPP_CONNECTED', { from: cur2, timeout: 3000 });
    assert.ok(connectEvent, 'Evento de conexão recebido pelo WebSocket');

    wsClient.close();
  });

  it('COMPL-04 Dashboard KPIs e métricas refletem o estado real do sistema', async () => {
    const res = await t.api('GET', '/api/stats/dashboard');
    assert.equal(res.status, 200);

    const stats = res.json.stats;
    assert.ok(stats, 'Objeto stats presente');
    assert.equal(stats.whatsappStatus, 'Conectado');
    assert.ok(stats.activeFlowsCount >= 1, 'Pelo menos o fluxo padrão deve estar ativo');
    assert.ok(typeof stats.pendingTasksCount === 'number');
    assert.ok(Array.isArray(res.json.pendingTasks));
    assert.ok(Array.isArray(res.json.activeSessions));
    assert.ok(Array.isArray(res.json.recentEvents));
  });

  it('COMPL-05 Assets do frontend e fontes do Bootstrap Icons estão disponíveis e íntegros', async () => {
    const requiredAssets = [
      { path: '/', mime: 'text/html' },
      { path: '/css/styles.css', mime: 'text/css' },
      { path: '/css/bootstrap.min.css', mime: 'text/css' },
      { path: '/css/bootstrap-icons.min.css', mime: 'text/css' },
      { path: '/js/api.js', mime: 'application/javascript' },
      { path: '/js/core.js', mime: 'application/javascript' },
      { path: '/js/dashboard.js', mime: 'application/javascript' },
      { path: '/js/chat.js', mime: 'application/javascript' },
      { path: '/js/tasks.js', mime: 'application/javascript' },
      { path: '/js/automations.js', mime: 'application/javascript' },
      { path: '/js/settings.js', mime: 'application/javascript' },
      { path: '/js/boot.js', mime: 'application/javascript' }
    ];

    for (const asset of requiredAssets) {
      const res = await t.api('GET', asset.path);
      assert.equal(res.status, 200, `Asset ${asset.path} falhou com status ${res.status}`);
      assert.ok(res.text.length > 50, `Asset ${asset.path} está vazio ou corrompido`);
    }

    // Checa cache de 7 dias configurado para minificados
    const minRes = await t.api('GET', '/css/bootstrap.min.css');
    assert.ok(minRes.headers['cache-control']?.includes('max-age=604800'), 'Assets estáticos minificados devem ter Cache-Control otimizado');
  });
});
