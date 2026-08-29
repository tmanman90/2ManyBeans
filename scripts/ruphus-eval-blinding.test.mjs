import assert from 'node:assert/strict';
import test from 'node:test';
import { checkHiddenRepeatConsistency, createBlindSchedule, lockBlindScores, renderBlindText, unblindScores } from './ruphus-eval/blinding.mjs';

test('blind schedules are opaque, reproducible, and randomized left/right', () => {
  const ids = ['dec-001', 'dec-002', 'dec-003', 'dec-004', 'dec-005', 'dec-006'];
  const first = createBlindSchedule({ caseIds: ids, seed: 'fixed-u4-seed' });
  assert.deepEqual(first, createBlindSchedule({ caseIds: ids, seed: 'fixed-u4-seed' }));
  assert.equal(first.length, ids.length);
  assert.equal(new Set(first.map((item) => item.label)).size, ids.length);
  assert.ok(first.every((item) => /^pair-[a-f0-9]{12}$/.test(item.label)));
  assert.ok(first.some((item) => item.left === 'candidate-a') && first.some((item) => item.left === 'candidate-b'));
  assert.ok(Math.abs(first.filter((item) => item.left === 'candidate-a').length - first.filter((item) => item.left === 'candidate-b').length) <= 1);
  assert.doesNotMatch(JSON.stringify(first), /luna|terra|sonnet|provider|model/i);
  assert.throws(() => createBlindSchedule({ caseIds: ['duplicate', 'duplicate'] }), /unique/);
});

test('offline blind renderer escapes active content and omits links', () => {
  const rendered = renderBlindText({ label: 'pair-0123456789ab', leftText: '<img src="https://bad.invalid/x">', rightText: 'candidate text https://bad.invalid/y' });
  assert.match(rendered, /&lt;img/);
  assert.doesNotMatch(rendered, /https?:\/\//i);
  assert.doesNotMatch(rendered, /<img|<script|iframe|remote-font/i);
  assert.throws(() => renderBlindText({ label: 'candidate-a', leftText: 'x', rightText: 'y' }), /opaque/);
  assert.throws(() => renderBlindText({ label: 'pair-0123456789ab', leftText: 'model: Luna medium', rightText: 'y' }), /identity/);
});

test('blind scores lock before unblinding and preserve opaque labels', () => {
  const schedule = createBlindSchedule({ caseIds: ['a', 'b'], seed: 'lock-seed' });
  const scores = Object.fromEntries(schedule.map(({ label }, index) => [label, index + 4]));
  const locked = lockBlindScores({ schedule, scores });
  assert.equal(locked.type, 'blind-score-lock');
  assert.deepEqual(unblindScores({ locked, schedule }).map(({ score }) => score).sort(), [4, 5]);
  assert.throws(() => lockBlindScores({ schedule, scores: { [schedule[0].label]: 4 } }), /cover/);
  assert.throws(() => unblindScores({ locked: { type: 'not-locked' }, schedule }), /locked/);
  assert.deepEqual(checkHiddenRepeatConsistency({ responses: [{ repeatKey: 'r1', output: 'same' }, { repeatKey: 'r1', output: 'same' }] }), { valid: true, groups: 1 });
  assert.equal(checkHiddenRepeatConsistency({ responses: [{ repeatKey: 'r1', output: 'a' }, { repeatKey: 'r1', output: 'b' }] }).valid, false);
});
