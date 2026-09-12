import assert from 'node:assert/strict';
import test from 'node:test';
import { sessionConversationForProvider, writeActiveSession } from '../api/ruphus-agent.js';
import { clientSessionWrite, startNewChat } from '../src/lib/ruphus/session.js';

const message = (id, role = 'user') => ({ id, role, text: id, createdAt: 1000 });

test('durable retry bubbles remain UI state rather than model conversation', () => {
  const session = { lastActivityAt: 1000, boundaryIndex: 0, messages: [
    message('question'),
    { ...message('transport failed', 'assistant'), errored: true, retry: { kind: 'agent', text: 'question' } },
    message('useful answer', 'assistant'),
  ] };
  assert.deepEqual(sessionConversationForProvider(session, { now: 1001 }), [
    { role: 'user', content: 'question' },
    { role: 'assistant', content: 'useful answer' },
  ]);
});
function store(initial) {
  let data = structuredClone(initial);
  let writes = 0;
  const ref = { collection: () => ref, doc: () => ref };
  return {
    get data() { return data; },
    get writes() { return writes; },
    replace(next) { data = structuredClone(next); },
    db: {
      collection: () => ref,
      async runTransaction(callback) {
        return callback({
          async get(target) {
            assert.equal(target, ref);
            return { exists: data != null, data: () => structuredClone(data) };
          },
          set(target, next) {
            assert.equal(target, ref);
            writes += 1;
            data = structuredClone(next);
          },
        });
      },
    },
  };
}

test('late successful and failed turns cannot restore an archived conversation', async () => {
  const before = { protocolVersion: 1, messages: [message('old-question')], boundaryIndex: 0, lastActivityAt: 1000 };
  const memory = store(before);
  const reset = clientSessionWrite(startNewChat(before, { now: 2000 }), { resetContext: true, archiveActive: true, remoteSession: before }).data;
  memory.replace(reset);
  for (const messages of [[...before.messages, message('late-answer', 'assistant')], before.messages]) {
    const wrote = await writeActiveSession(memory.db, 'owner', { ...before, messages }, { expectedBoundaryIndex: 0 });
    assert.equal(wrote, false);
    assert.deepEqual(memory.data, reset);
  }
  assert.equal(memory.writes, 0);
});

test('the next turn may commit within the new boundary without losing archived history', async () => {
  const before = { protocolVersion: 1, messages: [message('archived'), message('new-question')], boundaryIndex: 1, lastActivityAt: 2000 };
  const memory = store(before);
  assert.equal(await writeActiveSession(memory.db, 'owner', { ...before, messages: [...before.messages, message('new-answer', 'assistant')] }, { expectedBoundaryIndex: 1 }), true);
  assert.equal(memory.data.boundaryIndex, 1);
  assert.deepEqual(memory.data.messages.map(item => item.id), ['archived', 'new-question', 'new-answer']);
  assert.equal(memory.writes, 1);
});

test('first turn can persist when no active session existed', async () => {
  const memory = store(null);
  assert.equal(await writeActiveSession(memory.db, 'owner', { protocolVersion: 1, messages: [message('first')], boundaryIndex: 0 }, { expectedBoundaryIndex: 0 }), true);
  assert.equal(memory.data.messages[0].id, 'first');
});
