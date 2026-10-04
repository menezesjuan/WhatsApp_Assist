const test = require('node:test');
const assert = require('node:assert');
const InputNormalizer = require('../src/automation/InputNormalizer');

test('InputNormalizer: trims, lowercases, and removes diacritics', () => {
  assert.strictEqual(InputNormalizer.normalize(' 1 '), '1');
  assert.strictEqual(InputNormalizer.normalize('ORÇAMENTO'), 'orcamento');
  assert.strictEqual(InputNormalizer.normalize('Orçamento!'), 'orcamento');
  assert.strictEqual(InputNormalizer.normalize('Informações & Dúvidas'), 'informacoes duvidas');
  assert.strictEqual(InputNormalizer.normalize('   suporte...  '), 'suporte');
  assert.strictEqual(InputNormalizer.normalize(null), '');
  assert.strictEqual(InputNormalizer.normalize(undefined), '');
});

test('InputNormalizer: extracts leading numbers correctly', () => {
  assert.strictEqual(InputNormalizer.extractNumber('1'), '1');
  assert.strictEqual(InputNormalizer.extractNumber('01'), '1');
  assert.strictEqual(InputNormalizer.extractNumber('  2 - Suporte'), '2');
  assert.strictEqual(InputNormalizer.extractNumber('3.'), '3');
  assert.strictEqual(InputNormalizer.extractNumber('texto sem numero'), null);
});

test('InputNormalizer: extracts numbers from prefixes, words, and emojis', () => {
  assert.strictEqual(InputNormalizer.extractNumber('Opção 2'), '2');
  assert.strictEqual(InputNormalizer.extractNumber('opcao 3'), '3');
  assert.strictEqual(InputNormalizer.extractNumber('numero 1'), '1');
  assert.strictEqual(InputNormalizer.extractNumber('quero a opcao 2'), '2');
  assert.strictEqual(InputNormalizer.extractNumber('1️⃣'), '1');
  assert.strictEqual(InputNormalizer.extractNumber('2️⃣'), '2');
  assert.strictEqual(InputNormalizer.extractNumber('dois'), '2');
  assert.strictEqual(InputNormalizer.extractNumber('três'), '3');
  assert.strictEqual(InputNormalizer.extractNumber('tres'), '3');
  assert.strictEqual(InputNormalizer.extractNumber('opcao um'), '1');
});
