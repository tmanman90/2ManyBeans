import assert from 'node:assert/strict';
import test from 'node:test';
import { clientSessionWrite, continuePrevious, inflateAgentSession, normalizeAgentSession, prepareSession, restoreChatMessage, sessionAge, sessionPresentation, startNewChat, retainActionReceipt } from '../src/lib/ruphus/session.js';

test('Undo retires only the exact saved-revision controls, including after hydration', () => {
  const saved = { id: 'save', type: 'action_receipt', mode: 'promote_attempt', status: 'succeeded', revisionId: 'revision', coffeeId: 'coffee', slotKey: 'kalita_hot', undoAvailable: true, executionAvailable: true };
  const other = { ...saved, id: 'other', revisionId: 'other-revision' };
  const messages = [{ id: 'one', role: 'assistant', content: 'Saved', artifacts: [saved, other] }];
  const undo = { id: 'undo', type: 'undo_receipt', mode: 'undo_revision', status: 'succeeded', undoneRevisionId: 'revision', coffeeId: 'coffee', slotKey: 'kalita_hot' };
  const result = retainActionReceipt(messages, undo);
  assert.equal(result[0].artifacts[0].status, 'undone');
  assert.equal(result[0].artifacts[0].undoAvailable, false);
  assert.equal(result[0].artifacts[0].executionAvailable, false);
  assert.deepEqual(result[0].artifacts[1], other);
  assert.equal(saved.status, 'succeeded', 'do not mutate the supplied transcript');
  assert.deepEqual(retainActionReceipt(result, undo), result);
  const hydrated = normalizeAgentSession({ messages: [...messages, { id: 'two', role: 'assistant', content: 'Undone', artifacts: [undo] }] });
  assert.equal(hydrated.messages[0].artifacts[0].status, 'undone');
  const restored = inflateAgentSession({ protocolVersion: 1, messages: [...messages, { id: 'two', role: 'assistant', text: 'Undone', artifacts: [undo] }] });
  assert.equal(restored.messages[0].artifacts[0].status, 'undone');
  const { coffeeId: _coffee, slotKey: _slot, ...legacyUndo } = undo;
  const legacy = inflateAgentSession({ protocolVersion: 1, messages: [...messages, { id: 'two', role: 'assistant', text: 'Undone', artifacts: [legacyUndo] }] });
  assert.equal(legacy.messages[0].artifacts[0].status, 'undone', 'older Firestore receipts identify only the exact revision');
  const wrongCoffee = retainActionReceipt(messages, { ...undo, coffeeId: 'different-coffee' });
  assert.equal(wrongCoffee[0].artifacts[0].status, 'succeeded');
  const failed = retainActionReceipt(messages, { ...undo, status: 'failed' });
  assert.equal(failed[0].artifacts[0].status, 'succeeded');
});

test('Brew once receipt survives return to chat and replay does not duplicate it', () => {
  const proposal = { id: 'proposal', type: 'recipe_proposal', status: 'proposed' };
  const receipt = { id: 'action', type: 'action_receipt', mode: 'brew_once', proposalId: 'proposal', attemptId: 'attempt', status: 'succeeded' };
  const messages = [{ id: 'reply', role: 'assistant', content: 'Review this recipe.', turnId: 'turn', artifacts: [proposal] }];
  const updated = retainActionReceipt(messages, receipt, 'attempt_created');
  const restored = inflateAgentSession(normalizeAgentSession({ messages: updated })).messages.map(restoreChatMessage);
  assert.equal(restored[0].artifacts[0].status, 'attempt_created');
  assert.deepEqual(restored[0].artifacts[1], receipt);
  assert.deepEqual(retainActionReceipt(restored, receipt, 'attempt_created'), restored);
  const orphan = retainActionReceipt([], receipt, 'attempt_created');
  assert.equal(normalizeAgentSession({ messages: orphan }).messages[0].artifacts[0].attemptId, 'attempt');
  const optional = retainActionReceipt(messages, { ...receipt, state: undefined, title: undefined }, 'attempt_created');
  assert.equal(Object.hasOwn(optional[0].artifacts[1], 'state'), false, 'Firestore rejects undefined receipt fields');
  assert.equal(Object.hasOwn(optional[0].artifacts[1], 'title'), false);
  const recovered = [...updated, { id: 'recovered', role: 'assistant', content: 'Here is that trial.', artifacts: [{ ...receipt, status: 'ready', promoteAvailable: true }] }];
  const saved = retainActionReceipt(recovered, { id: 'saved', type: 'action_receipt', mode: 'promote_attempt', status: 'succeeded', attemptId: 'attempt', proposalId: 'proposal' }, 'applied');
  assert.equal(saved.at(-1).artifacts[0].promoteAvailable, false);
  assert.equal(saved.flatMap(item => item.artifacts).filter(item => item.id === 'saved').length, 1);
  assert.equal(saved.at(-1).artifacts.some(item => item.id === 'saved'), true, 'Save confirmation belongs next to the latest recovered trial, not the older proposal');
});

test('ordinary UI saves preserve server evidence while explicit New chat clears it', () => {
  const remote = normalizeAgentSession({ messages: [{ role: 'assistant', text: 'Try reducing the water by 20g for this thin clean cup.' }], ledger: { entries: [{ kind: 'evidence_read', summary: 'Kalita recipe checked' }] }, launchHintConsumed: true, turns: [{ id: 'turn-1' }] });
  const ui = normalizeAgentSession({ messages: remote.messages });
  const write = clientSessionWrite(ui);
  assert.equal(write.merge, true);
  for (const key of ['ledger', 'turns', 'boundaryIndex', 'contextRef', 'launchContext', 'launchHintConsumed', 'historyWidened', 'lastActivityAt']) assert.equal(key in write.data, false);
  const saved = { ...remote, ...write.data };
  assert.deepEqual(saved.ledger, remote.ledger);
  assert.equal(saved.launchHintConsumed, true);
  const cleared = clientSessionWrite(startNewChat(saved), { resetContext: true });
  assert.equal(cleared.merge, false);
  assert.deepEqual(cleared.data.ledger.entries, []);
  assert.equal(cleared.data.boundaryIndex, saved.messages.length);
});

test('active UI suffix retains the archived prefix across transactional saves', () => {
  const archived = [{ id: 'old', role: 'user', text: 'Use Aiden' }, { id: 'old-reply', role: 'assistant', text: 'Old Aiden advice' }];
  const remote = startNewChat(normalizeAgentSession({ messages: archived }));
  const ui = normalizeAgentSession({ messages: [{ id: 'new', role: 'user', text: 'Use Kalita' }] });
  const write = clientSessionWrite(ui, { remoteSession: remote });
  const saved = { ...remote, ...write.data };
  assert.equal(saved.boundaryIndex, 2);
  assert.equal(saved.messages.length, 3);
  assert.deepEqual(saved.messages.slice(saved.boundaryIndex).map(message => message.text), ['Use Kalita']);
  const replay = clientSessionWrite(ui, { remoteSession: saved });
  assert.deepEqual(replay.data.messages, saved.messages, 'repeated saves do not duplicate the archive');
});

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

test('a second New chat preserves the first archived conversation and is replay-safe', () => {
  const first = normalizeAgentSession({ messages: [{ id: 'first', role: 'user', text: 'First conversation' }] });
  const remote = startNewChat(first);
  const active = normalizeAgentSession({ messages: [{ id: 'second', role: 'user', text: 'Second conversation' }] });
  const reset = startNewChat(active);
  const write = clientSessionWrite(reset, { resetContext: true, archiveActive: true, remoteSession: remote });
  assert.equal(write.merge, false);
  assert.deepEqual(write.data.messages.map(message => message.id), ['first', 'second']);
  assert.equal(write.data.boundaryIndex, 2);
  assert.deepEqual(write.data.ledger.entries, []);
  const replay = clientSessionWrite(reset, { resetContext: true, archiveActive: true, remoteSession: write.data });
  assert.deepEqual(replay.data.messages, write.data.messages);
  assert.equal(replay.data.boundaryIndex, 2);
});

test('Continue previous does not archive the resumed active conversation', () => {
  const remote = normalizeAgentSession({ messages: [{ id: 'old', role: 'user', text: 'Archived' }, { id: 'active', role: 'user', text: 'Resume this' }], boundaryIndex: 1, lastActivityAt: 1 });
  const resumed = continuePrevious(remote, { now: 1000000000 });
  const write = clientSessionWrite(resumed, { resetContext: true, remoteSession: remote });
  assert.equal(write.data.boundaryIndex, 1);
  assert.deepEqual(write.data.messages.map(message => message.id), ['old', 'active']);
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
