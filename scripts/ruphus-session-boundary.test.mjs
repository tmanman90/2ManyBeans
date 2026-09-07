import assert from 'node:assert/strict';
import test from 'node:test';
import { continuePrevious, inflateAgentSession, normalizeAgentSession, prepareSession, restoreChatMessage, sessionAge, sessionPresentation, startNewChat } from '../src/lib/ruphus/session.js';

test('saved Agent conversation retains its native proposal through display restoration', () => {
  const artifact = { id: 'proposal', type: 'recipe_proposal', actions: ['apply_proposal'], status: 'proposed' };
  const saved = normalizeAgentSession({ messages: [{ id: 'reply', role: 'assistant', content: 'Review this change.', turnId: 'turn', artifacts: [artifact] }] });
  const message = inflateAgentSession(saved).messages.map(restoreChatMessage)[0];
  assert.equal(message.turnId, 'turn');
  assert.deepEqual(message.artifacts, [artifact]);
  assert.equal(message.content, 'Review this change.');
  const legacy = restoreChatMessage({ id: 'old', role: 'assistant', content: 'Hello' });
  assert.equal('turnId' in legacy, false);
  assert.equal('artifacts' in legacy, false);
});

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
test('session replay preserves sanitized method focus without slot or reference authority', () => {
  const session = normalizeAgentSession({ ledger: { entries: [{ kind: 'method_focus', status: 'available', namedCoffees: ['El Vergel'], methodFocus: { displayName: 'hot Kalita', slot: 'kalita_hot', coffeeRef: 'secret' } }] } });
  assert.deepEqual(session.ledger.entries[0].methodFocus, { displayName: 'hot Kalita' });
  assert.equal(session.ledger.entries[0].methodFocus.slot, undefined);
  assert.equal(session.ledger.entries[0].methodFocus.coffeeRef, undefined);
});
