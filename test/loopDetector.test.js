const test = require('node:test');
const assert = require('node:assert');
const LoopDetector = require('../src/utils/LoopDetector');

test('LoopDetector: detects alternating 2-step loop (A -> B -> A -> B -> A)', () => {
  const detector = new LoopDetector({ maxTransitions: 15 });
  const contact = 'test-contact-1';

  // Transitions: 1 -> 2 -> 1 -> 2
  assert.strictEqual(detector.recordAndCheck(contact, 1).hasLoop, false);
  assert.strictEqual(detector.recordAndCheck(contact, 2).hasLoop, false);
  assert.strictEqual(detector.recordAndCheck(contact, 1).hasLoop, false);
  assert.strictEqual(detector.recordAndCheck(contact, 2).hasLoop, false);

  // 5th transition: back to 1 completes [1, 2, 1, 2, 1] oscillation cycle!
  const res = detector.recordAndCheck(contact, 1);
  assert.strictEqual(res.hasLoop, true);
  assert.match(res.reason, /repeating 2-step oscillation cycle/);
});

test('LoopDetector: halts when exceeding max transitions limit', () => {
  const detector = new LoopDetector({ maxTransitions: 5 });
  const contact = 'test-contact-2';

  for (let i = 1; i <= 5; i++) {
    const res = detector.recordAndCheck(contact, i * 10);
    assert.strictEqual(res.hasLoop, false);
  }

  // 6th transition triggers max limit
  const res = detector.recordAndCheck(contact, 99);
  assert.strictEqual(res.hasLoop, true);
  assert.match(res.reason, /Exceeded maximum transitions limit/);
});
