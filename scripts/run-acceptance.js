#!/usr/bin/env node
'use strict';
/**
 * Acceptance gate runner.
 *
 *   node scripts/run-acceptance.js                  -> all suites
 *   node scripts/run-acceptance.js functional       -> only test/acceptance/functional
 *   node scripts/run-acceptance.js security usability
 *
 * Exit code 0 = application APPROVED, 1 = REJECTED (at least one acceptance criterion failed).
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const baseDir = path.join(root, 'test', 'acceptance');
const SUITES = ['functional', 'security', 'usability'];

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'helpers' ? [] : walk(full);
    return entry.name.endsWith('.test.js') ? [full] : [];
  });
}

const requested = process.argv.slice(2).filter((a) => SUITES.includes(a));
const suites = requested.length ? requested : SUITES;
const files = suites.flatMap((s) => walk(path.join(baseDir, s))).sort();

if (files.length === 0) {
  console.error('Nenhum teste de aceitacao encontrado.');
  process.exit(2);
}

console.log(`\nBateria de aceitacao: ${suites.join(', ')} (${files.length} arquivos)\n`);

const result = spawnSync(
  process.execPath,
  ['--test', '--test-concurrency=1', '--test-reporter=spec', ...files],
  { cwd: root, stdio: 'inherit', env: process.env }
);

const approved = result.status === 0;
console.log('\n' + '='.repeat(60));
console.log(approved ? ' RESULTADO: APROVADA  (todos os criterios de aceitacao atendidos)'
                     : ' RESULTADO: REPROVADA (ha criterios de aceitacao nao atendidos)');
console.log('='.repeat(60) + '\n');
process.exit(approved ? 0 : 1);
