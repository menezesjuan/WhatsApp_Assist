const test = require('node:test');
const assert = require('node:assert');
const IdempotencyGuard = require('../src/utils/IdempotencyGuard');

test('IdempotencyGuard: catches duplicate message IDs within TTL', async () => {
  const guard = new IdempotencyGuard(100); // 100ms TTL for test
  const msgId = 'unique-msg-abc-123';

  // First time: not duplicate
  assert.strictEqual(guard.isDuplicate(msgId), false);

  // Immediate retry: duplicate!
  assert.strictEqual(guard.isDuplicate(msgId), true);

  // Wait for TTL to expire
  await new Promise(r => setTimeout(r, 120));

  // Expired: should be treated as new entry
  assert.strictEqual(guard.isDuplicate(msgId), false);

  guard.destroy();
});
