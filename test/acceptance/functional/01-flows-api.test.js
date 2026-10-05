'use strict';
/**
 * FUNCIONAL - Fluxos, etapas, opcoes e simulador (API)
 * Fonte dos criterios: README (secoes 4 "Linha do Tempo & Motor de Automacoes" e Etapa 2/3 do tutorial).
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('../helpers/harness');

const rejected = (r) => r.status >= 400 && r.status < 500;

describe('FUNC-FLOW | Fluxos de automacao', () => {
  let t;
  before(async () => { t = await h.start(); });
  after(async () => { await h.stop(); });

  const mkFlow = async (extra = {}) => {
    const r = await t.api('POST', '/api/automations', { name: `Fluxo ${h.uid()}`, ...extra });
    assert.equal(r.status, 201, r.text);
    return r.json.id;
  };
  const mkStep = async (flowId, extra = {}) => {
    const r = await t.api('POST', `/api/automations/${flowId}/steps`, { name: `Etapa ${h.uid()}`, message_text: 'Mensagem', ...extra });
    assert.equal(r.status, 201, r.text);
    return r.json.stepId;
  };
  const mkOpt = async (stepId, extra = {}) => {
    const r = await t.api('POST', `/api/automations/steps/${stepId}/options`, { condition_type: 'KEYWORD', condition_value: 'oi', ...extra });
    assert.equal(r.status, 201, r.text);
    return r.json.optionId;
  };
  const getFlow = async (id) => (await t.api('GET', `/api/automations/${id}`)).json;

  it('FLOW-01 o sistema ja vem com o fluxo padrao "Primeiro Atendimento" ativo', async () => {
    const r = await t.api('GET', '/api/automations');
    assert.equal(r.status, 200);
    const flow = r.json.flows.find((f) => f.name === 'Primeiro Atendimento');
    assert.ok(flow, 'fluxo padrao ausente');
    assert.equal(flow.is_default, 1);
    assert.equal(flow.is_active, 1);
    assert.ok(flow.step_count >= 4, 'menu + 3 opcoes esperados');
  });

  it('FLOW-02 o fluxo padrao oferece menu 1/2/3 e cada opcao leva a uma etapa existente', async () => {
    const list = (await t.api('GET', '/api/automations')).json.flows;
    const def = list.find((f) => f.is_default === 1);
    const full = await getFlow(def.id);
    const menu = full.steps.find((s) => s.id === full.flow.initial_step_id);
    assert.ok(menu, 'etapa inicial definida');
    const numeric = menu.options.filter((o) => o.condition_type === 'NUMERIC_OPTION').map((o) => o.condition_value).sort();
    assert.deepEqual(numeric, ['1', '2', '3']);
    const stepIds = new Set(full.steps.map((s) => s.id));
    for (const o of menu.options) assert.ok(stepIds.has(o.next_step_id), `opcao ${o.condition_value} aponta para etapa inexistente`);
  });

  it('FLOW-03 criar fluxo: retorna 201, persiste e remove espacos do nome', async () => {
    const r = await t.api('POST', '/api/automations', { name: '   Vendas  ', description: 'Triagem de vendas' });
    assert.equal(r.status, 201);
    const stored = await getFlow(r.json.id);
    assert.equal(stored.flow.name, 'Vendas');
    assert.equal(stored.flow.description, 'Triagem de vendas');
  });

  it('FLOW-04 nome do fluxo e obrigatorio e deve ser texto', async () => {
    for (const body of [{}, { name: '' }, { name: '   ' }, { name: 123 }, { name: { a: 1 } }, { name: null }]) {
      const r = await t.api('POST', '/api/automations', body);
      assert.ok(rejected(r), `${JSON.stringify(body)} deveria ser rejeitado com 4xx, veio ${r.status}`);
    }
  });

  it('FLOW-05 existe no maximo um fluxo padrao', async () => {
    const a = await mkFlow({ is_default: 1 });
    const b = await mkFlow({ is_default: 1 });
    const defaults = (await t.api('GET', '/api/automations')).json.flows.filter((f) => f.is_default === 1);
    assert.equal(defaults.length, 1);
    assert.equal(defaults[0].id, b);
    assert.notEqual(defaults[0].id, a);
    await t.api('PUT', `/api/automations/${b}`, { is_default: 0 });
    // restaura o fluxo padrao original para nao afetar outros testes
    const original = (await t.api('GET', '/api/automations')).json.flows.find((f) => f.name === 'Primeiro Atendimento');
    await t.api('PUT', `/api/automations/${original.id}`, { is_default: 1 });
  });

  it('FLOW-06 editar fluxo persiste; fluxo inexistente retorna 404; nome vazio e rejeitado', async () => {
    const id = await mkFlow();
    const ok = await t.api('PUT', `/api/automations/${id}`, { name: 'Renomeado', description: 'nova', is_active: 0 });
    assert.equal(ok.status, 200);
    const stored = (await getFlow(id)).flow;
    assert.equal(stored.name, 'Renomeado');
    assert.equal(stored.is_active, 0);
    assert.equal((await t.api('PUT', '/api/automations/999999', { name: 'x' })).status, 404);
    for (const name of ['', '   ', 5, {}]) {
      const r = await t.api('PUT', `/api/automations/${id}`, { name });
      assert.ok(rejected(r), `nome ${JSON.stringify(name)} deveria ser rejeitado, veio ${r.status}`);
    }
    assert.equal((await getFlow(id)).flow.name, 'Renomeado', 'edicao invalida nao pode alterar o nome');
  });

  it('FLOW-07 duplicar fluxo copia etapas/opcoes com ids remapeados, inativo e sem alterar o original', async () => {
    const flowId = await mkFlow();
    const a = await mkStep(flowId, { name: 'A' });
    const b = await mkStep(flowId, { name: 'B' });
    await mkOpt(a, { condition_type: 'NUMERIC_OPTION', condition_value: '1', next_step_id: b });
    const before = await getFlow(flowId);

    const dup = await t.api('POST', `/api/automations/${flowId}/duplicate`);
    assert.equal(dup.status, 201);
    const copy = await getFlow(dup.json.id);
    assert.notEqual(copy.flow.id, flowId);
    assert.equal(copy.flow.is_active, 0, 'copia nasce inativa');
    assert.equal(copy.flow.is_default, 0);
    assert.ok(copy.flow.name.includes(before.flow.name));
    assert.notEqual(copy.flow.name, before.flow.name);
    assert.deepEqual(copy.steps.map((s) => s.name), ['A', 'B']);

    const cA = copy.steps.find((s) => s.name === 'A');
    const cB = copy.steps.find((s) => s.name === 'B');
    assert.equal(copy.flow.initial_step_id, cA.id, 'etapa inicial remapeada');
    assert.equal(cA.options[0].next_step_id, cB.id, 'opcao deve apontar para a etapa COPIADA');

    const after = await getFlow(flowId);
    assert.deepEqual(after, before, 'original nao pode mudar');
  });

  it('FLOW-08 duplicar/excluir fluxo inexistente retorna 404', async () => {
    assert.equal((await t.api('POST', '/api/automations/999999/duplicate')).status, 404);
    assert.equal((await t.api('DELETE', '/api/automations/999999')).status, 404);
    assert.equal((await t.api('GET', '/api/automations/999999')).status, 404);
  });

  it('FLOW-09 excluir fluxo remove etapas e opcoes (sem registros orfaos)', async () => {
    const flowId = await mkFlow();
    const s = await mkStep(flowId);
    const o = await mkOpt(s);
    assert.equal((await t.api('DELETE', `/api/automations/${flowId}`)).status, 200);
    assert.equal((await t.api('GET', `/api/automations/${flowId}`)).status, 404);
    const d = h.db();
    assert.equal(d.prepare('SELECT count(*) c FROM automation_steps WHERE id = ?').get(s).c, 0);
    assert.equal(d.prepare('SELECT count(*) c FROM automation_options WHERE id = ?').get(o).c, 0);
  });
});

describe('FUNC-STEP | Etapas', () => {
  let t;
  before(async () => { t = await h.start(); });
  after(async () => { await h.stop(); });

  const mkFlow = async () => (await t.api('POST', '/api/automations', { name: `F ${h.uid()}` })).json.id;
  const mkStep = async (flowId, extra = {}) => {
    const r = await t.api('POST', `/api/automations/${flowId}/steps`, { name: `E ${h.uid()}`, message_text: 'm', ...extra });
    assert.equal(r.status, 201, r.text);
    return r.json.stepId;
  };
  const getFlow = async (id) => (await t.api('GET', `/api/automations/${id}`)).json;

  it('STEP-01 a primeira etapa criada vira a etapa inicial; as seguintes nao a alteram', async () => {
    const f = await mkFlow();
    const first = await mkStep(f);
    await mkStep(f);
    assert.equal((await getFlow(f)).flow.initial_step_id, first);
  });

  it('STEP-02 validacoes: nome obrigatorio, tentativas > 0, prioridade valida, fluxo existente', async () => {
    const f = await mkFlow();
    const post = (body, flow = f) => t.api('POST', `/api/automations/${flow}/steps`, body);
    assert.ok(rejected(await post({ name: '' })), 'nome vazio');
    assert.ok(rejected(await post({ name: 123 })), 'nome nao textual');
    for (const max_attempts of [0, -1, 'abc', 1.5]) {
      const r = await post({ name: 'x', max_attempts });
      assert.ok(rejected(r), `max_attempts=${JSON.stringify(max_attempts)} deveria ser rejeitado, veio ${r.status}`);
    }
    const bad = await post({ name: 'x', task_priority: 'ULTRA' });
    assert.ok(rejected(bad), 'prioridade invalida deveria ser rejeitada');
    for (const task_priority of ['LOW', 'MEDIUM', 'HIGH', 'URGENT']) {
      assert.equal((await post({ name: `p-${task_priority}`, task_priority })).status, 201);
    }
    assert.equal((await post({ name: 'x' }, 999999)).status, 404, 'fluxo inexistente deve retornar 404');
  });

  it('STEP-03 editar etapa e parcial: campos nao enviados permanecem; inexistente retorna 404', async () => {
    const f = await mkFlow();
    const s = await mkStep(f, { name: 'Original', message_text: 'texto', task_priority: 'HIGH' });
    const r = await t.api('PUT', `/api/automations/steps/${s}`, { name: 'Novo nome' });
    assert.equal(r.status, 200);
    const step = (await getFlow(f)).steps.find((x) => x.id === s);
    assert.equal(step.name, 'Novo nome');
    assert.equal(step.message_text, 'texto');
    assert.equal(step.task_priority, 'HIGH');
    assert.equal((await t.api('PUT', '/api/automations/steps/999999', { name: 'x' })).status, 404);
    assert.ok(rejected(await t.api('PUT', `/api/automations/steps/${s}`, { task_priority: 'ULTRA' })));
    assert.ok(rejected(await t.api('PUT', `/api/automations/steps/${s}`, { name: '   ' })));
  });

  it('STEP-04 excluir etapa nao deixa opcoes nem etapa inicial apontando para uma etapa inexistente', async () => {
    const f = await mkFlow();
    const a = await mkStep(f, { name: 'A' });
    const b = await mkStep(f, { name: 'B' });
    await t.api('POST', `/api/automations/steps/${a}/options`, { condition_type: 'KEYWORD', condition_value: 'ir', next_step_id: b });

    assert.equal((await t.api('DELETE', `/api/automations/steps/${b}`)).status, 200);
    let flow = await getFlow(f);
    for (const o of flow.steps.find((s) => s.id === a).options) {
      assert.ok(o.next_step_id === null || flow.steps.some((s) => s.id === o.next_step_id), 'opcao aponta para etapa removida');
    }

    assert.equal((await t.api('DELETE', `/api/automations/steps/${a}`)).status, 200);
    flow = await getFlow(f);
    assert.ok(flow.flow.initial_step_id === null || flow.steps.some((s) => s.id === flow.flow.initial_step_id), 'etapa inicial aponta para etapa removida');
    assert.equal((await t.api('DELETE', '/api/automations/steps/999999')).status, 404);
  });
});

describe('FUNC-OPT | Opcoes (regras de ramificacao)', () => {
  let t;
  let flowId;
  let stepId;
  before(async () => {
    t = await h.start();
    flowId = (await t.api('POST', '/api/automations', { name: `F ${h.uid()}` })).json.id;
    stepId = (await t.api('POST', `/api/automations/${flowId}/steps`, { name: 'Menu', message_text: 'm' })).json.stepId;
  });
  after(async () => { await h.stop(); });

  const post = (body, step = stepId) => t.api('POST', `/api/automations/steps/${step}/options`, body);
  const options = async () => (await t.api('GET', `/api/automations/${flowId}`)).json.steps.find((s) => s.id === stepId).options;

  it('OPT-01 aceita todos os tipos documentados; ANY_TEXT assume "*" e EMPTY guarda vazio', async () => {
    for (const [condition_type, condition_value] of [['NUMERIC_OPTION', '1'], ['KEYWORD', 'preco, valor'], ['EXACT_MATCH', 'sim']]) {
      assert.equal((await post({ condition_type, condition_value })).status, 201, condition_type);
    }
    assert.equal((await post({ condition_type: 'ANY_TEXT' })).status, 201);
    assert.equal((await post({ condition_type: 'EMPTY' })).status, 201);
    const list = await options();
    assert.equal(list.find((o) => o.condition_type === 'ANY_TEXT').condition_value, '*');
    assert.equal(list.find((o) => o.condition_type === 'EMPTY').condition_value, '');
  });

  it('OPT-02 validacoes: tipo obrigatorio e valido, valor obrigatorio, destino existente, acao valida', async () => {
    assert.ok(rejected(await post({ condition_value: 'x' })), 'sem tipo');
    assert.ok(rejected(await post({ condition_type: 'DROP_TABLE', condition_value: 'x' })), 'tipo invalido');
    assert.ok(rejected(await post({ condition_type: 'KEYWORD' })), 'KEYWORD sem valor');
    assert.ok(rejected(await post({ condition_type: 'KEYWORD', condition_value: '   ' })), 'KEYWORD com valor em branco');
    assert.ok(rejected(await post({ condition_type: 'KEYWORD', condition_value: 'x', next_step_id: 999999 })), 'destino inexistente');
    assert.ok(rejected(await post({ condition_type: 'KEYWORD', condition_value: 'x', action_type: 'FORMAT_DISK' })), 'acao invalida');
    assert.equal((await post({ condition_type: 'KEYWORD', condition_value: 'x' }, 999999)).status, 404, 'etapa inexistente');
  });

  it('OPT-03 editar e excluir opcao; inexistentes retornam 404', async () => {
    const created = await post({ condition_type: 'KEYWORD', condition_value: 'editar-me', label: 'antes' });
    const id = created.json.optionId;
    assert.equal((await t.api('PUT', `/api/automations/options/${id}`, { label: 'depois', condition_value: 'editado' })).status, 200);
    const stored = (await options()).find((o) => o.id === id);
    assert.equal(stored.label, 'depois');
    assert.equal(stored.condition_value, 'editado');
    assert.equal((await t.api('DELETE', `/api/automations/options/${id}`)).status, 200);
    assert.equal((await options()).some((o) => o.id === id), false);
    assert.equal((await t.api('PUT', '/api/automations/options/999999', { label: 'x' })).status, 404);
    assert.equal((await t.api('DELETE', '/api/automations/options/999999')).status, 404);
  });

  it('OPT-04 as opcoes sao devolvidas na ordem configurada (order_index)', async () => {
    const f = (await t.api('POST', '/api/automations', { name: `Ord ${h.uid()}` })).json.id;
    const s = (await t.api('POST', `/api/automations/${f}/steps`, { name: 'M', message_text: 'm' })).json.stepId;
    for (const [value, order_index] of [['c', 3], ['a', 1], ['b', 2]]) {
      await post({ condition_type: 'KEYWORD', condition_value: value, order_index }, s);
    }
    const list = (await t.api('GET', `/api/automations/${f}`)).json.steps[0].options;
    assert.deepEqual(list.map((o) => o.condition_value), ['a', 'b', 'c']);
  });
});

describe('FUNC-SIM | Simulador de regras (Modo de Teste)', () => {
  let t;
  let flowId;
  let menu;
  before(async () => {
    t = await h.start();
    h.connectMock();
    const flows = (await t.api('GET', '/api/automations')).json.flows;
    flowId = flows.find((f) => f.name === 'Primeiro Atendimento').id;
    const full = (await t.api('GET', `/api/automations/${flowId}`)).json;
    menu = full.steps.find((s) => s.id === full.flow.initial_step_id);
  });
  after(async () => { await h.stop(); });

  const sim = (body) => t.api('POST', '/api/automations/test-simulate', body);

  it('SIM-01 sem entrada, mostra a etapa inicial e a mensagem que seria enviada', async () => {
    const r = await sim({ flowId, stepId: menu.id });
    assert.equal(r.status, 200);
    assert.equal(r.json.result.currentStep.name, 'Menu Principal');
    assert.equal(r.json.result.outboundReply, menu.message_text);
  });

  it('SIM-02 entrada "1" casa a opcao numerica, informa regra, proxima etapa e criacao de task', async () => {
    const r = await sim({ flowId, stepId: menu.id, input: '1' });
    const res = r.json.result;
    assert.equal(res.matched, true);
    assert.ok(res.reason && res.reason.length > 0, 'justificativa tecnica ausente');
    assert.equal(res.nextStep.name, 'Opção Orçamento');
    assert.equal(res.willCreateTask, true);
  });

  it('SIM-03 entrada sem regra correspondente informa que nao casou e a mensagem de orientacao', async () => {
    const res = (await sim({ flowId, stepId: menu.id, input: 'blablabla xyz' })).json.result;
    assert.equal(res.matched, false);
    assert.ok(res.outboundReply && res.outboundReply.length > 0);
    assert.equal(res.willCreateTask, false);
  });

  it('SIM-04 validacoes: flowId obrigatorio, fluxo/etapa inexistente retorna erro 4xx', async () => {
    assert.ok(rejected(await sim({})), 'sem flowId');
    assert.ok(rejected(await sim({ flowId: 999999 })), 'fluxo inexistente');
    assert.ok(rejected(await sim({ flowId, stepId: 999999, input: '1' })), 'etapa inexistente');
  });

  it('SIM-05 a simulacao nao tem efeitos colaterais: nao envia mensagem, nao cria task nem sessao', async () => {
    h.clearOutbox();
    const tasksBefore = (await t.api('GET', '/api/tasks?limit=500')).json.tasks.length;
    const sessionsBefore = (await t.api('GET', '/api/stats/dashboard')).json.activeSessions.length;
    for (const input of ['1', '2', '3', 'qualquer coisa']) await sim({ flowId, stepId: menu.id, input });
    assert.equal(h.outbox.length, 0);
    assert.equal((await t.api('GET', '/api/tasks?limit=500')).json.tasks.length, tasksBefore);
    assert.equal((await t.api('GET', '/api/stats/dashboard')).json.activeSessions.length, sessionsBefore);
  });
});
