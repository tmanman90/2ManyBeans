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
  const rendered = renderBlindText({ label: 'pair-0123456789ab', leftText: '<img src="x">', rightText: 'candidate text' });
  assert.match(rendered, /&lt;img/);
  assert.doesNotMatch(rendered, /https?:\/\//i);
  assert.doesNotMatch(rendered, /<img|<script|iframe|remote-font/i);
  assert.throws(() => renderBlindText({ label: 'candidate-a', leftText: 'x', rightText: 'y' }), /opaque/);
  assert.throws(() => renderBlindText({ label: 'pair-0123456789ab', leftText: 'model: Luna medium', rightText: 'y' }), /identity/);
  assert.throws(() => renderBlindText({ label: 'pair-0123456789ab', leftText: 'javascript:alert(1)', rightText: 'y' }), /identity/);
  assert.throws(() => renderBlindText({ label: 'pair-0123456789ab', leftText: 'data:text/html,x', rightText: 'y' }), /identity/);
  assert.throws(() => renderBlindText({ label: 'pair-0123456789ab', leftText: 'https://bad.invalid', rightText: 'y' }), /identity/);
});

test('blind scores lock before unblinding and preserve opaque labels', () => {
  const schedule = createBlindSchedule({ caseIds: ['a', 'b'], seed: 'lock-seed' });
  const dimensions = ['diagnosis', 'proposal-usefulness', 'uncertainty', 'clarity', 'concision', 'willingness-to-approve'];
  const scores = Object.fromEntries(schedule.map(({ label }, index) => [label, Object.fromEntries([...dimensions.map((dimension) => [dimension, index + 4]), ['unknown', false], ['abstain', false]])]));
  const locked = lockBlindScores({ schedule, scores });
  assert.equal(locked.type, 'blind-score-lock');
  assert.deepEqual(unblindScores({ locked, schedule }).map(({ score }) => score.diagnosis).sort(), [4, 5]);
  assert.throws(() => lockBlindScores({ schedule, scores: { [schedule[0].label]: 4 } }), /cover/);
  const missingFlags = structuredClone(scores);
  delete missingFlags[schedule[0].label].unknown;
  assert.throws(() => lockBlindScores({ schedule, scores: missingFlags }), /unknown and abstain/);
  assert.throws(() => lockBlindScores({ schedule, scores, scheduleHash: 'wrong' }), /hash/);
  assert.throws(() => unblindScores({ locked: { type: 'not-locked' }, schedule }), /locked/);
  const swapped = schedule.map((entry, index) => index === 0 ? { ...entry, left: entry.right, right: entry.left } : entry);
  assert.throws(() => unblindScores({ locked, schedule: swapped }), /map/);
  assert.deepEqual(checkHiddenRepeatConsistency({ responses: [{ repeatKey: 'r1', output: 'same' }, { repeatKey: 'r1', output: 'same' }] }), { valid: true, groups: 1 });
  assert.equal(checkHiddenRepeatConsistency({ responses: [{ repeatKey: 'r1', output: 'a' }, { repeatKey: 'r1', output: 'b' }] }).valid, false);
});
