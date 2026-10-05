'use strict';
/**
 * SEGURANÇA & PRIVACIDADE - Zero-Log e Ephemeral Processing
 * Fonte dos critérios: README (seção "Princípios de Privacidade & Segurança - Privacy by Design").
 * Regra: NENHUMA mensagem de cliente é persistida em banco de dados ou logs.
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h = require('../helpers/harness');

describe('SEC-PRIVACY | Zero-Log e Proteção de Dados do Cliente', () => {
  let t;
  before(async () => {
    t = await h.start();
    h.connectMock();
  });
  after(async () => {
    await h.stop();
  });

  it('PRIV-01 schema SQLite NÃO possui tabelas de mensagens ou histórico de chat', async () => {
    const d = h.db();
    const tables = d.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map((r) => r.name.toLowerCase());

    const forbidden = ['messages', 'chat_messages', 'conversations', 'whatsapp_messages', 'message_history', 'chat_logs'];
    for (const f of forbidden) {
      assert.equal(tables.includes(f), false, `Tabela proibida encontrada no banco de dados: ${f}`);
    }
  });

  it('PRIV-02 mensagens de triagem são processadas em memória e NUNCA gravadas nas tabelas SQLite', async () => {
    const secretMarker = `SEGREDO_CONFIDENCIAL_${Date.now()}`;
    const phone = h.nextPhone();

    // Envia mensagem contendo o texto secreto
    await h.customerSays(phone, `Quero informações sobre ${secretMarker}`);

    // Varre todas as colunas de todas as tabelas do banco procurando o segredo
    const dbHits = h.scanDbForText(secretMarker);
    assert.deepEqual(dbHits, [], `O texto da mensagem do cliente foi persistido no banco de dados em: ${dbHits.join(', ')}`);
  });

  it('PRIV-03 tabela event_metadata registra apenas resumos técnicos e NUNCA o conteúdo da mensagem', async () => {
    const sensitiveMsg = `NUMERO_CARTAO_1234_5678_${Date.now()}`;
    const phone = h.nextPhone();

    await h.customerSays(phone, sensitiveMsg);

    const d = h.db();
    const recentEvents = d.prepare('SELECT summary FROM event_metadata ORDER BY id DESC LIMIT 20').all();
    for (const ev of recentEvents) {
      assert.equal(
        ev.summary.includes(sensitiveMsg),
        false,
        `Texto sensível de cliente encontrado no resumo de eventos técnicos: ${ev.summary}`
      );
    }
  });

  it('PRIV-04 SanitizedLogger redacta automaticamente chaves sensíveis nos logs', async () => {
    const Logger = h.mod('utils/SanitizedLogger');
    const logger = new Logger('TestPrivacyLogger');

    h.clearLogs();
    logger.info('Evento teste', {
      contactId: '5511999998888',
      message: 'Mensagem ultra secreta',
      password: 'senha123_super_secreta',
      token: 'jwt.token.abc'
    });

    const output = h.logs();
    assert.ok(output.includes('[REDACTED_BY_POLICY]'), 'Campos proibidos devem ser substituídos por [REDACTED_BY_POLICY]');
    assert.equal(output.includes('Mensagem ultra secreta'), false, 'Texto da mensagem vazou no log!');
    assert.equal(output.includes('senha123_super_secreta'), false, 'Senha vazou no log!');
    assert.equal(output.includes('jwt.token.abc'), false, 'Token vazou no log!');
  });
});
