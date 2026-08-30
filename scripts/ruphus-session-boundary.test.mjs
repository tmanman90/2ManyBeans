import assert from 'node:assert/strict';
import test from 'node:test';
import { continuePrevious, normalizeAgentSession, prepareSession, sessionAge, sessionPresentation, startNewChat } from '../src/lib/ruphus/session.js';

test('age classification uses the approved six-hour and seven-day boundaries', () => {
  const now = 100000000;
  assert.equal(sessionAge({ lastActivityAt: now - 2 * 3600000, now }).state, 'fresh');
  assert.equal(sessionAge({ lastActivityAt: now - 2 * 86400000, now }).state, 'recent');
  assert.equal(sessionAge({ lastActivityAt: now - 14 * 86400000, now }).state, 'stale');
});
test('new chat advances a boundary and clears ledger without deleting messages', () => {
  const original = normalizeAgentSession({ messages: [{ id: 'm1', role: 'user', text: 'hello', createdAt: 1 }], ledger: { entries: [{ namedCoffees: ['El Vergel'] }] }, boundaryIndex: 0, lastActivityAt: 1 });
  const next = startNewChat(original, { now: 2 });
  assert.equal(next.messages.length, 1); assert.equal(next.boundaryIndex, 1); assert.equal(next.ledger.entries.length, 0); assert.equal(continuePrevious(next, { now: 3 }).messages[0].text, 'hello');
});
test('stale sessions present Continue before replay and recent sessions resume visibly', () => {
  const now = 1000000000;
  const session = { protocolVersion: 1, messages: [{ id: 'm1', role: 'user', text: 'old cup', createdAt: 1 }], lastActivityAt: now - 8 * 86400000, ledger: { entries: [{ kind: 'evidence_read' }] } };
  const stale = sessionPresentation(session, { now });
  assert.equal(stale.showOpening, true);
  assert.equal(stale.showContinue, true);
  const resumed = continuePrevious(session, { now });
  assert.equal(sessionPresentation(resumed, { now }).showContinue, false);
  assert.equal(resumed.ledger.entries.length, 0);
});
test('session metadata is validated and stale replay preserves the ledger and launch state', () => {
  const session = normalizeAgentSession({ messages: [{ id: 'm1', role: 'user', text: 'older', createdAt: 1 }], boundaryIndex: 99, lastActivityAt: Number.POSITIVE_INFINITY, launchHintConsumed: true, ledger: { entries: [{ kind: 'evidence_read', namedCoffees: ['El Vergel'], coffee: { id: 'secret', name: 'El Vergel' }, records: [{ id: 'raw' }] }] } });
  assert.equal(session.boundaryIndex, 1); assert.equal(session.launchHintConsumed, true); assert.equal(session.ledger.entries[0].coffee.id, undefined); assert.equal(session.ledger.entries[0].records, undefined);
  const stale = prepareSession({ ...session, lastActivityAt: 1 }, { now: 1000000000 });
  assert.equal(stale.ledger.namedCoffees[0], 'El Vergel'); assert.equal(stale.messages.length, 1);
});
