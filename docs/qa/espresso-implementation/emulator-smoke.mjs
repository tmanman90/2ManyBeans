import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { writeFile } from 'node:fs/promises';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

// Verification harness only: real Auth + Firestore emulators, real endpoint
// middleware, synthetic account, and no model key or production credentials.
const projectId = 'demo-espresso-acceptance';
assert.equal(process.env.GCLOUD_PROJECT, projectId);
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:58080');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:59099');
assert.equal(Boolean(process.env.FIREBASE_SERVICE_ACCOUNT), false);
assert.equal(Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS), false);
assert.equal(Boolean(process.env.OPENAI_API_KEY), false);
const uid = 'espresso-smoke-owner';
process.env.RUPHUS_AGENT_V3_UIDS = uid;
const app = initializeApp({ projectId });
const auth = getAuth(app);
const db = getFirestore(app);
let server;
try {
  await auth.createUser({ uid, email: 'espresso-smoke@example.test', password: 'local-fixture-only-123' });
  await db.doc(`users/${uid}`).set({ subscription: { status: 'active', plan: 'pro' } });
  const signedIn = await fetch('http://127.0.0.1:59099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'espresso-smoke@example.test', password: 'local-fixture-only-123', returnSecureToken: true }),
  });
  assert.equal(signedIn.status, 200);
  const { idToken } = await signedIn.json();
  assert.equal((await auth.verifyIdToken(idToken, true)).uid, uid);
  const { default: handler } = await import('../../../api/ruphus-agent.js');
  server = createServer(async (req, res) => {
    req.body = {};
    res.status = code => { res.statusCode = code; return res; };
    res.json = body => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); };
    try { await handler(req, res); }
    catch { res.status(500).json({ error: 'harness_failure' }); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/ruphus-agent`;
  const anonymous = await fetch(url, { method: 'POST' });
  assert.equal(anonymous.status, 401);
  const authenticated = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${idToken}` } });
  assert.equal(authenticated.status, 400);
  assert.match((await authenticated.json()).error, /turnId/);
  const ref = db.doc(`users/${uid}/verification/counter`);
  await ref.set({ count: 0 });
  await Promise.all([1, 2].map(() => db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    tx.update(ref, { count: snap.data().count + 1 });
  })));
  assert.equal((await ref.get()).data().count, 2);
  const receipt = { status: 'passed', projectId, persistence: 'actual local Firestore emulator', authentication: 'actual Auth emulator token verified by unchanged API middleware', anonymousStatus: 401, authenticatedValidationStatus: 400, transactionCounter: 2, modelCalls: 0, liveConversationCases: 0, timestamp: new Date().toISOString() };
  await writeFile(new URL('./emulator-smoke-receipt.json', import.meta.url), `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify(receipt));
} finally {
  if (server) await new Promise(resolve => server.close(resolve));
  await db.terminate();
  await deleteApp(app);
}
