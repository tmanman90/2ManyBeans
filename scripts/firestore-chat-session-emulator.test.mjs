import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import { clientSessionWrite, normalizeAgentSession, startNewChat } from '../src/lib/ruphus/session.js';

// Opt-in, local emulator only. A temporary package root avoids changing the
// application's runtime dependencies for the Firebase rules test utilities.
test('chat session rules accept actual client shapes and retain authority boundaries', {
  skip: !process.env.FIRESTORE_EMULATOR_HOST,
}, async () => {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST, /^127\.0\.0\.1:\d+$/);
  const require = createRequire(process.env.RUPHUS_RULES_TEST_PACKAGE_ROOT
    ? `${process.env.RUPHUS_RULES_TEST_PACKAGE_ROOT}/package.json` : import.meta.url);
  const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
  const { doc, setDoc, getDoc } = require('firebase/firestore');
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
  const env = await initializeTestEnvironment({
    projectId: 'demo-ruphus-session-rules',
    firestore: { host, port: Number(port), rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8') },
  });
  try {
    const owner = env.authenticatedContext('fixture-owner').firestore();
    const stranger = env.authenticatedContext('fixture-other').firestore();
    const anonymous = env.unauthenticatedContext().firestore();
    const path = 'users/fixture-owner/chatSessions/active';
    const session = normalizeAgentSession({ messages: [{ id: 'hello', role: 'user', text: 'My Kalita tasted thin', createdAt: 1 }] });
    await assertSucceeds(setDoc(doc(owner, path), session));
    const serverSession = normalizeAgentSession({ ...session, ledger: { entries: [{ kind: 'evidence_read', summary: 'Kalita checked' }] }, launchHintConsumed: true });
    await env.withSecurityRulesDisabled(async context => setDoc(doc(context.firestore(), path), serverSession));
    const uiWrite = clientSessionWrite(session);
    await assertSucceeds(setDoc(doc(owner, path), uiWrite.data, { merge: uiWrite.merge }));
    const readback = (await getDoc(doc(owner, path))).data();
    assert.deepEqual(readback.ledger, serverSession.ledger);
    assert.equal(readback.launchHintConsumed, true);
    const boundary = startNewChat(session);
    await assertSucceeds(setDoc(doc(owner, path), boundary));
    assert.equal((await getDoc(doc(owner, path))).data().boundaryIndex, 1);
    await assertSucceeds(setDoc(doc(owner, path), { messages: [], updatedAt: 1 }));
    const longSession = normalizeAgentSession({ messages: Array.from({ length: 51 }, (_, i) => ({ role: 'user', text: `Turn ${i}`, id: `${i}` })) });
    await assertSucceeds(setDoc(doc(owner, path), longSession));
    await assertFails(setDoc(doc(owner, path), { messages: longSession.messages, updatedAt: 1 }));
    await assertFails(setDoc(doc(stranger, path), session));
    await assertFails(getDoc(doc(stranger, path)));
    await assertFails(setDoc(doc(anonymous, path), session));
    await assertFails(setDoc(doc(owner, 'users/fixture-owner/chatSessions/other'), session));
    for (const patch of [
      { unexpected: true }, { protocolVersion: 2 }, { contextRef: 'bad' },
      { launchContext: 'bad' }, { boundaryIndex: -1 }, { boundaryIndex: 2 },
      { lastActivityAt: 'bad' }, { launchHintConsumed: 'bad' }, { historyWidened: 'bad' },
      { ledger: { ...session.ledger, bytes: 4097 } },
      { ledger: { ...session.ledger, entries: Array(9).fill({}) } },
    ]) await assertFails(setDoc(doc(owner, path), { ...session, ...patch }));
    for (const collection of ['proposals', 'recipeRevisions', 'brewAttempts', 'actions', 'receipts']) {
      await assertFails(setDoc(doc(owner, `users/fixture-owner/${collection}/forged`), { status: 'applied' }));
    }
  } finally {
    await env.cleanup();
  }
});
