const test = require('node:test');
const assert = require('node:assert');
const RuleEngine = require('../src/automation/RuleEngine');

const mockOptions = [
  { id: 1, condition_type: 'NUMERIC_OPTION', condition_value: '1', next_step_id: 2, label: '1 - Orçamento', order_index: 1 },
  { id: 2, condition_type: 'KEYWORD', condition_value: 'orcamento', next_step_id: 2, label: 'Orçamento', order_index: 2 },
  { id: 3, condition_type: 'NUMERIC_OPTION', condition_value: '2', next_step_id: 3, label: '2 - Suporte', order_index: 3 },
  { id: 4, condition_type: 'KEYWORD', condition_value: 'suporte,ajuda', next_step_id: 3, label: 'Suporte', order_index: 4 },
  { id: 5, condition_type: 'NUMERIC_OPTION', condition_value: '3', next_step_id: 4, label: '3 - Informações', order_index: 5 }
];

test('RuleEngine: matches numeric options deterministically', () => {
  const res1 = RuleEngine.evaluate(mockOptions, '1');
  assert.strictEqual(res1.matchedOption.id, 1);

  const res2 = RuleEngine.evaluate(mockOptions, ' 2 ');
  assert.strictEqual(res2.matchedOption.id, 3);

  const res3 = RuleEngine.evaluate(mockOptions, '3 - Quero saber mais');
  assert.strictEqual(res3.matchedOption.id, 5);
});

test('RuleEngine: matches keyword options with accents and capitalization', () => {
  const res1 = RuleEngine.evaluate(mockOptions, 'Quero um ORÇAMENTO por favor');
  assert.strictEqual(res1.matchedOption.id, 2);

  const res2 = RuleEngine.evaluate(mockOptions, 'preciso de AJUDA');
  assert.strictEqual(res2.matchedOption.id, 4);
});

test('RuleEngine: returns NO_MATCHING_RULE when no option matches', () => {
  const res = RuleEngine.evaluate(mockOptions, 'Boa noite, tudo bem?');
  assert.strictEqual(res.matchedOption, null);
  assert.strictEqual(res.reason, 'NO_MATCHING_RULE');
});

test('RuleEngine: matches ANY_TEXT and EMPTY fallbacks', () => {
  const anyOptions = [
    { id: 10, condition_type: 'ANY_TEXT', condition_value: '*', next_step_id: 20 }
  ];
  const res = RuleEngine.evaluate(anyOptions, 'Qualquer coisa digitada');
  assert.strictEqual(res.matchedOption.id, 10);
});

test('RuleEngine: does not swallow input when ANY_TEXT has specific condition_value (user test bug fix)', () => {
  const userOptions = [
    { id: 10, condition_type: 'ANY_TEXT', condition_value: '1', label: 'Selecionado1', order_index: 0 },
    { id: 11, condition_type: 'ANY_TEXT', condition_value: '2', label: 'selecionado 2', order_index: 1 }
  ];
  const resFor2 = RuleEngine.evaluate(userOptions, '2');
  assert.strictEqual(resFor2.matchedOption.id, 11);
  assert.strictEqual(resFor2.matchedOption.label, 'selecionado 2');

  const resFor1 = RuleEngine.evaluate(userOptions, '1');
  assert.strictEqual(resFor1.matchedOption.id, 10);
  assert.strictEqual(resFor1.matchedOption.label, 'Selecionado1');
});

test('RuleEngine: matches options via prefixes, word numbers, and emojis', () => {
  const resPrefix = RuleEngine.evaluate(mockOptions, 'Opção 2');
  assert.strictEqual(resPrefix.matchedOption.id, 3);

  const resWord = RuleEngine.evaluate(mockOptions, 'dois');
  assert.strictEqual(resWord.matchedOption.id, 3);

  const resEmoji = RuleEngine.evaluate(mockOptions, '1️⃣');
  assert.strictEqual(resEmoji.matchedOption.id, 1);

  const resSentence = RuleEngine.evaluate(mockOptions, 'quero a opção 2 por favor');
  assert.strictEqual(resSentence.matchedOption.id, 3);
});

test('RuleEngine: matches option via label matching when input writes the label text', () => {
  const labelOptions = [
    { id: 101, condition_type: 'NUMERIC_OPTION', condition_value: '1', label: 'Orçamento', order_index: 0 },
    { id: 102, condition_type: 'NUMERIC_OPTION', condition_value: '2', label: 'Suporte Técnico', order_index: 1 }
  ];

  const resText1 = RuleEngine.evaluate(labelOptions, 'orçamento');
  assert.strictEqual(resText1.matchedOption.id, 101);

  const resText2 = RuleEngine.evaluate(labelOptions, 'suporte');
  assert.strictEqual(resText2.matchedOption.id, 102);
});
