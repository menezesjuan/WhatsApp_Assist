'use strict';
/**
 * FUNCIONAL - Módulo de Captação de Clientes (Google Maps Scraper & Validador de WhatsApp)
 * Critérios:
 * - Busca automatizada por nicho/localização
 * - Extração de Nome, Telefone, Website, Endereço
 * - Identificação de contato WhatsApp ativo (Sim / Não)
 * - Persistência, filtros, exportação CSV e conversão para Task no Kanban
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('../helpers/harness');
const GoogleMapsScraper = require('../../../src/scraper/GoogleMapsScraper');

describe('FUNC-LEADS | Captação de Clientes & Validação de WhatsApp', () => {
  let t;
  before(async () => {
    t = await h.start();
    h.connectMock();
  });
  after(async () => {
    await h.stop();
  });

  it('LEAD-01 Normalizador de telefones BR identifica celulares, fixos e adiciona DDI 55', () => {
    // Celular com DDD sem DDI
    const cel1 = GoogleMapsScraper.normalizePhone('(11) 98765-4321');
    assert.equal(cel1.isValid, true);
    assert.equal(cel1.isMobile, true);
    assert.equal(cel1.clean, '5511987654321');
    assert.equal(cel1.formatted, '+55 (11) 98765-4321');

    // Fixo com DDD
    const fix1 = GoogleMapsScraper.normalizePhone('(41) 3232-1010');
    assert.equal(fix1.isValid, true);
    assert.equal(fix1.isMobile, false);
    assert.equal(fix1.clean, '554132321010');
    assert.equal(fix1.formatted, '+55 (41) 3232-1010');

    // Com zero à esquerda (ex: 011999998888)
    const comZero = GoogleMapsScraper.normalizePhone('011999998888');
    assert.equal(comZero.clean, '5511999998888');
    assert.equal(comZero.isMobile, true);

    // Número inválido
    const invalido = GoogleMapsScraper.normalizePhone('1234');
    assert.equal(invalido.isValid, false);
  });

  it('LEAD-02 Validador de WhatsApp identifica contas ativas e inativas', async () => {
    const waManager = h.mod('whatsapp/WhatsAppManager');

    // No MockAdapter, números terminando em '00' são inativos; celulares com 9 são ativos
    const resAtivo = await waManager.checkNumberHasWhatsApp('5511998877665');
    assert.equal(resAtivo.checked, true);
    assert.equal(resAtivo.hasWhatsApp, true);
    assert.equal(resAtivo.jid, '5511998877665@c.us');

    const resInativo = await waManager.checkNumberHasWhatsApp('5511998877600');
    assert.equal(resInativo.checked, true);
    assert.equal(resInativo.hasWhatsApp, false);
  });

  it('LEAD-03 POST /api/leads/search valida entrada e rejeita consultas vazias com 400', async () => {
    const resVazio = await t.api('POST', '/api/leads/search', {});
    assert.equal(resVazio.status, 400);
    assert.match(resVazio.json.error, /obrigatório/i);

    const resEspacos = await t.api('POST', '/api/leads/search', { query: '   ' });
    assert.equal(resEspacos.status, 400);
  });

  it('LEAD-04 POST /api/leads/search executa captação, valida WhatsApp e persiste leads', async () => {
    // Executa em ambiente mock para garantir determinismo e velocidade
    const res = await t.api('POST', '/api/leads/search', {
      query: 'Pet Shop',
      location: 'Curitiba',
      maxResults: 6,
      checkWhatsApp: true
    });

    assert.equal(res.status, 200);
    assert.equal(res.json.success, true);
    assert.ok(res.json.count >= 6, 'Deveria ter retornado pelo menos 6 leads');
    assert.ok(Array.isArray(res.json.leads));

    const first = res.json.leads[0];
    assert.ok(first.business_name, 'Possui nome da empresa');
    assert.ok(first.phone_formatted, 'Possui telefone formatado');
    assert.ok(first.has_whatsapp === 1 || first.has_whatsapp === 0, 'Possui status WhatsApp checado');
  });

  it('LEAD-05 GET /api/leads lista leads, calcula estatísticas e suporta filtros', async () => {
    const res = await t.api('GET', '/api/leads?limit=50');
    assert.equal(res.status, 200);
    assert.ok(res.json.leads.length >= 6);
    assert.ok(res.json.stats.total >= 6);
    assert.ok(res.json.stats.withWhatsApp >= 1, 'Deve haver leads com WhatsApp');

    // Filtro por apenas com WhatsApp
    const comWa = await t.api('GET', '/api/leads?has_whatsapp=1');
    assert.equal(comWa.status, 200);
    for (const lead of comWa.json.leads) {
      assert.equal(lead.has_whatsapp, 1);
    }

    // Filtro por sem WhatsApp
    const semWa = await t.api('GET', '/api/leads?has_whatsapp=0');
    assert.equal(semWa.status, 200);
    for (const lead of semWa.json.leads) {
      assert.equal(lead.has_whatsapp, 0);
    }

    // Filtro por com website
    const comSite = await t.api('GET', '/api/leads?has_website=1');
    assert.equal(comSite.status, 200);
    for (const lead of comSite.json.leads) {
      assert.ok(lead.website_url && lead.website_url.length > 0);
    }
  });

  it('LEAD-06 GET /api/leads/export gera CSV com cabeçalhos e suporte a Excel UTF-8 BOM', async () => {
    const res = await t.raw({ path: '/api/leads/export' });
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /text\/csv/);
    assert.match(res.headers['content-disposition'], /leads_prospeccao/);

    const text = res.text;
    assert.ok(text.startsWith('\uFEFF'), 'Deve conter Byte Order Mark UTF-8 para compatibilidade Excel');
    assert.ok(text.includes('Nome da Empresa'));
    assert.ok(text.includes('Possui WhatsApp'));
    assert.ok(text.includes('Website'));
  });

  it('LEAD-07 POST /api/leads/:id/create-task converte lead em tarefa Kanban', async () => {
    const listRes = await t.api('GET', '/api/leads?limit=1');
    const targetLead = listRes.json.leads[0];
    assert.ok(targetLead, 'Lead existe para conversão');

    const taskRes = await t.api('POST', `/api/leads/${targetLead.id}/create-task`, {});
    assert.equal(taskRes.status, 200);
    assert.equal(taskRes.json.success, true);
    assert.ok(taskRes.json.task.id, 'Task ID retornado');
    assert.match(taskRes.json.task.title, new RegExp(targetLead.business_name, 'i'));

    // Verifica que a task foi gravada e vinculada ao lead
    const updatedLead = (await t.api('GET', '/api/leads?limit=50')).json.leads.find(l => l.id === targetLead.id);
    assert.equal(updatedLead.task_id, taskRes.json.task.id);
    assert.equal(updatedLead.status, 'CONTACTED');
  });

  it('LEAD-08 DELETE /api/leads/:id e DELETE /api/leads excluem leads', async () => {
    const listRes = await t.api('GET', '/api/leads?limit=1');
    const toDelete = listRes.json.leads[0];

    const delSingle = await t.api('DELETE', `/api/leads/${toDelete.id}`);
    assert.equal(delSingle.status, 200);

    const checkSingle = (await t.api('GET', '/api/leads?limit=50')).json.leads.find(l => l.id === toDelete.id);
    assert.equal(checkSingle, undefined, 'Lead excluído não deve aparecer na lista');

    // Limpar todos
    const delAll = await t.api('DELETE', '/api/leads');
    assert.equal(delAll.status, 200);
    const emptyCheck = await t.api('GET', '/api/leads');
    assert.equal(emptyCheck.json.leads.length, 0);
  });
});
