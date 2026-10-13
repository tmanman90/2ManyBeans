import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { writeFile } from 'node:fs/promises';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { buildEspressoRecipe, editEspressoRecipe } from '../../../src/lib/espressoRecipes.js';
import { canonicalHash } from '../../../src/lib/ruphus/contracts.js';
import { absentRecipeSourceHash } from '../../../src/lib/ruphus/recipeSourceState.js';

const projectId = 'demo-espresso-acceptance';
assert.equal(process.env.GCLOUD_PROJECT, projectId);
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:58080');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:59099');
for (const key of ['FIREBASE_SERVICE_ACCOUNT', 'GOOGLE_APPLICATION_CREDENTIALS', 'OPENAI_API_KEY']) assert.ok(!process.env[key]);
const uid = 'espresso-u2-owner';
process.env.RUPHUS_AGENT_V3_UIDS = uid;
process.env.RUPHUS_AGENT_V3_MUTATION_UIDS = uid;
const app = initializeApp({ projectId });
const auth = getAuth(app);
const db = getFirestore(app);
const setup = { espressoMachine: 'breville-barista-express', espressoBasket: 'stock-double-single-wall', espressoGrinder: 'integrated', espressoSetupConfirmed: true };
const checks = [];
const check = async (name, fn) => { try { await fn(); checks.push({ name, status: 'passed' }); } catch (error) { checks.push({ name, status: 'failed', error: error.message }); } };
const beanRef = id => db.doc(`users/${uid}/beans/${id}`);
const readBean = async id => (await beanRef(id).get()).data();
const seed = async id => { await beanRef(id).set({ name: id, roastLevel: 'medium', ownerId: uid }); return buildEspressoRecipe({ bean: { id, roastLevel: 'medium' }, setup }).recipe; };
let server;
try {
  await auth.createUser({ uid, email: 'espresso-u2@example.test', password: 'local-fixture-only-123' });
  await db.doc(`users/${uid}`).set({ subscription: { status: 'active', plan: 'pro' }, preferences: setup });
  const signedIn = await fetch('http://127.0.0.1:59099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'espresso-u2@example.test', password: 'local-fixture-only-123', returnSecureToken: true }) });
  const { idToken } = await signedIn.json();
  assert.equal((await auth.verifyIdToken(idToken, true)).uid, uid);
  const { default: handler } = await import('../../../api/recipe-command.js');
  server = createServer(async (req, res) => {
    res.status = code => { res.statusCode = code; return res; };
    res.json = body => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); };
    try { let body = ''; for await (const part of req) body += part; req.body = body ? JSON.parse(body) : {}; await handler(req, res); }
    catch (error) { res.status(500).json({ error: 'harness_failure', message: error.message }); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/recipe-command`;
  const send = async command => { const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` }, body: JSON.stringify({ ...command, clientVersion: '1.1.255' }) }); return { status: response.status, body: await response.json() }; };
  const command = (id, actionId, recipe, revisionId = null) => ({ coffeeId: id, actionId, slotKey: 'espresso', mode: 'replace_active_recipe', recipe, patch: { espressoRecipe: recipe }, ...(revisionId ? { expectedRevisionId: revisionId } : { expectedRevisionHash: absentRecipeSourceHash('espresso') }) });
  const recipe = await seed('main');
  const tasting = { notes: ['cocoa', 'dry finish'], scores: { sweetness: 4 }, actuals: { doseGrams: 18, yieldGrams: 37, timeSeconds: 29 }, cupContext: { recipeSnapshot: recipe, equipment: setup, revisionId: 'prior-fixture' } };
  const tastingRef = db.doc(`users/${uid}/tastings/prior`);
  await tastingRef.set(tasting);
  let first, second, undone;
  await check('Authenticated first save persists recipe and revision', async () => { first = await send(command('main', 'first', recipe)); assert.equal(first.status, 200, JSON.stringify(first.body)); assert.equal((await readBean('main')).espressoRecipe.yieldGrams, 36); assert.equal((await readBean('main')).activeRevisionIds.espresso, first.body.revision.id); });
  await check('Direct save offers guarded Undo in receipt', async () => { assert.equal(first.body.receipt.undoAvailable, true); });
  await check('Duplicate request does not create revision', async () => { const before = canonicalHash(await readBean('main')); const replay = await send(command('main', 'first', recipe)); assert.equal(replay.status, 200); assert.deepEqual(replay.body, first.body); assert.equal(canonicalHash(await readBean('main')), before); });
  await check('Stale first-save absence cannot overwrite saved recipe', async () => { const reply = await send(command('main', 'stale-absence', recipe)); assert.equal(reply.status, 409); });
  await check('Owner scoped bean cannot be accessed by another owner', async () => { await db.doc('users/other-owner/beans/foreign').set({ espressoRecipe: recipe }); const reply = await send(command('foreign', 'foreign-write', { ...recipe, coffeeId: 'foreign' })); assert.equal(reply.status, 404); });
  await check('Second save and ordinary Undo restore exact prior targets', async () => { const changed = editEspressoRecipe(recipe, { yieldGrams: 39 }).recipe; second = await send(command('main', 'second', changed, first.body.revision.id)); assert.equal(second.status, 200, JSON.stringify(second.body)); undone = await send({ actionId: 'undo-second', mode: 'undo_revision', coffeeId: 'main', slotKey: 'espresso', expectedRevisionId: second.body.revision.id }); assert.equal(undone.status, 200, JSON.stringify(undone.body)); assert.deepEqual((await readBean('main')).espressoRecipe, recipe); });
  await check('Subsequent direct replacement also offers Undo', async () => { assert.equal(second.body.receipt.undoAvailable, true); });
  await check('Duplicate Undo leaves complete persisted state unchanged', async () => { const before = canonicalHash(await readBean('main')); const count = (await db.collection(`users/${uid}/recipeRevisions`).get()).size; const replay = await send({ actionId: 'undo-second', mode: 'undo_revision', coffeeId: 'main', slotKey: 'espresso', expectedRevisionId: second.body.revision.id }); assert.equal(replay.status, 200); assert.deepEqual(replay.body, undone.body); assert.equal(canonicalHash(await readBean('main')), before); assert.equal((await db.collection(`users/${uid}/recipeRevisions`).get()).size, count); });
  await check('Stale Undo preserves newer edit and all fields', async () => { const changed = editEspressoRecipe(recipe, { yieldGrams: 42 }).recipe; const newer = await send(command('main', 'third', changed, undone.body.revision.id)); assert.equal(newer.status, 200); const before = canonicalHash(await readBean('main')); const result = await send({ actionId: 'stale-undo', mode: 'undo_revision', coffeeId: 'main', slotKey: 'espresso', expectedRevisionId: second.body.revision.id }); assert.equal(result.status, 409); assert.equal(canonicalHash(await readBean('main')), before); });
  await check('Espresso patch cannot bypass validated recipe bounds', async () => { const valid = await seed('patch'); const request = command('patch', 'bad-patch', valid); request.patch = { 'espressoRecipe.doseGrams': 99 }; const reply = await send(request); assert.ok(reply.status >= 400, JSON.stringify(reply)); assert.ok(!(await readBean('patch')).espressoRecipe); });
  await check('Recipe snapshot bean identity must match command', async () => { const valid = await seed('identity'); const reply = await send(command('identity', 'bad-identity', { ...valid, coffeeId: 'other-bean' })); assert.ok(reply.status >= 400, JSON.stringify(reply)); assert.ok(!(await readBean('identity')).espressoRecipe); });
  await check('Unsupported and inconsistent setup identity rejected', async () => { const valid = await seed('setup'); const reply = await send(command('setup', 'bad-setup', { ...valid, setup: { ...valid.setup, machine: 'unknown-machine' } })); assert.ok(reply.status >= 400, JSON.stringify(reply)); assert.ok(!(await readBean('setup')).espressoRecipe); });
  await check('Recipe targets cannot contain observed-shot fields', async () => { const valid = await seed('actuals'); const reply = await send(command('actuals', 'bad-actuals', { ...valid, actualYieldGrams: 100 })); assert.ok(reply.status >= 400, JSON.stringify(reply)); });
  await check('Current owner setup rejects stale prior grinder write', async () => {
    const valid = await seed('stale-setup');
    const external = { ...setup, espressoGrinder: 'external', espressoGrinderModel: 'Fixture external grinder' };
    await db.doc(`users/${uid}`).update({ preferences: external });
    try { const reply = await send(command('stale-setup', 'stale-grinder', valid)); assert.ok(reply.status >= 400, 'old grinder recipe must not be saved after owner setup changed'); assert.ok(!(await readBean('stale-setup')).espressoRecipe); }
    finally { await db.doc(`users/${uid}`).update({ preferences: setup }); }
  });
  await check('Missing profile preferences cannot authorize stale bean preferences', async () => {
    const valid = await seed('missing-profile');
    await beanRef('missing-profile').update({ preferences: setup });
    await db.doc(`users/${uid}`).set({ subscription: { status: 'active', plan: 'pro' } });
    try {
      const before = canonicalHash(await readBean('missing-profile'));
      const reply = await send(command('missing-profile', 'missing-profile-save', valid));
      assert.ok(reply.status >= 400, JSON.stringify(reply));
      assert.equal(canonicalHash(await readBean('missing-profile')), before);
    } finally { await db.doc(`users/${uid}`).update({ preferences: setup }); }
  });
  await check('Cross-setup Undo removes undone target and preserves original setup', async () => {
    const original = editEspressoRecipe(await seed('roundtrip'), { yieldGrams: 39 }).recipe;
    const savedA = await send(command('roundtrip', 'roundtrip-a', original)); assert.equal(savedA.status, 200);
    const before = await readBean('roundtrip');
    const external = { ...setup, espressoGrinder: 'external', espressoGrinderModel: 'Fixture external grinder' };
    await db.doc(`users/${uid}`).update({ preferences: external });
    try {
      const targetB = editEspressoRecipe(buildEspressoRecipe({ bean: { id: 'roundtrip' }, setup: external }).recipe, { yieldGrams: 42 }).recipe;
      const savedB = await send(command('roundtrip', 'roundtrip-b', targetB, savedA.body.revision.id)); assert.equal(savedB.status, 200, JSON.stringify(savedB.body));
      const undo = await send({ actionId: 'roundtrip-undo', mode: 'undo_revision', coffeeId: 'roundtrip', slotKey: 'espresso', expectedRevisionId: savedB.body.revision.id }); assert.equal(undo.status, 200, JSON.stringify(undo.body));
      assert.deepEqual((await readBean('roundtrip')).espressoRecipesBySetup, before.espressoRecipesBySetup);
    } finally { await db.doc(`users/${uid}`).update({ preferences: setup }); }
  });
  await check('Cross-setup Undo restores an earlier target for edited setup', async () => {
    const initial = await seed('multisetup');
    const external = { ...setup, espressoGrinder: 'external', espressoGrinderModel: 'Fixture external grinder' };
    const setupB = buildEspressoRecipe({ bean: { id: 'multisetup' }, setup: external }).recipe;
    let revision = null;
    const save = async (name, preferences, base, yieldGrams) => {
      await db.doc(`users/${uid}`).update({ preferences });
      const reply = await send(command('multisetup', name, editEspressoRecipe(base, { yieldGrams }).recipe, revision));
      assert.equal(reply.status, 200, JSON.stringify(reply.body)); revision = reply.body.revision.id;
    };
    try {
      await save('multi-a39', setup, initial, 39);
      await save('multi-b42', external, setupB, 42);
      await save('multi-a41', setup, initial, 41);
      const before = (await readBean('multisetup')).espressoRecipesBySetup;
      await save('multi-b45', external, setupB, 45);
      const undo = await send({ actionId: 'multi-undo', mode: 'undo_revision', coffeeId: 'multisetup', slotKey: 'espresso', expectedRevisionId: revision });
      assert.equal(undo.status, 200, JSON.stringify(undo.body));
      assert.deepEqual((await readBean('multisetup')).espressoRecipesBySetup, before);
    } finally { await db.doc(`users/${uid}`).update({ preferences: setup }); }
  });
  await check('Ordinary Pro direct Espresso Save and Undo work outside Agent rollout', async () => {
    const valid = await seed('ordinary');
    process.env.RUPHUS_AGENT_V3_UIDS = '';
    process.env.RUPHUS_AGENT_V3_MUTATION_UIDS = '';
    try {
      const saved = await send(command('ordinary', 'ordinary-save', valid)); assert.equal(saved.status, 200);
      const undo = await send({ actionId: 'ordinary-undo', mode: 'undo_revision', clientIntent: 'espresso_direct_undo', coffeeId: 'ordinary', slotKey: 'espresso', expectedRevisionId: saved.body.revision.id });
      assert.equal(undo.status, 200, JSON.stringify(undo.body)); assert.ok(!(await readBean('ordinary')).espressoRecipe);
      const otherMode = await send({ actionId: 'ordinary-agent-mode', mode: 'brew_once', coffeeId: 'ordinary', slotKey: 'espresso', proposalId: 'not-authorized' });
      assert.equal(otherMode.status, 404);
    } finally { process.env.RUPHUS_AGENT_V3_UIDS = uid; process.env.RUPHUS_AGENT_V3_MUTATION_UIDS = uid; }
  });
  await check('Prior tasting record remains byte-equivalent after mutations', async () => { assert.equal(canonicalHash((await tastingRef.get()).data()), canonicalHash(tasting)); });
  const receipt = { time: new Date().toISOString(), projectId, proof: 'actual authenticated recipe-command endpoint and real Firestore/Auth emulators', modelCalls: 0, liveConversationCases: 0, status: checks.every(x => x.status === 'passed') ? 'passed' : 'failed', checks };
  const filename = `emulator-U2-${Date.now()}-receipt.json`;
  await writeFile(new URL(`./${filename}`, import.meta.url), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify({ ...receipt, filename }));
  if (receipt.status !== 'passed') process.exitCode = 1;
} finally { if (server) await new Promise(resolve => server.close(resolve)); await db.terminate(); await deleteApp(app); }
