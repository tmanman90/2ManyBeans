// Root acceptance harness: actual authenticated endpoint/provider/tools and local
// Auth/Firestore. Never seed production or substitute a scripted model response.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { buildEspressoRecipe, editEspressoRecipe } from '../../../src/lib/espressoRecipes.js';
import { canonicalHash } from '../../../src/lib/ruphus/contracts.js';
import { recoveryForAgentFrame } from '../../../src/lib/ruphus/recovery.js';
import { absentRecipeSourceHash } from '../../../src/lib/ruphus/recipeSourceState.js';
import { priceUsage, PRICING_REGISTRY_VERSION } from '../../../api/_lib/modelPricing.js';

const projectId = 'demo-espresso-acceptance';
assert.equal(process.env.GCLOUD_PROJECT, projectId);
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:58080');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:59099');
for (const key of ['FIREBASE_SERVICE_ACCOUNT', 'GOOGLE_APPLICATION_CREDENTIALS', 'OPENAI_API_KEY']) assert.ok(!process.env[key]);
const [caseId, variant = 'clear', perturbation = null] = process.argv.slice(2);
const variants = ['clear', 'casual', 'incomplete'];
const oracleFile = await readFile(new URL('./live-oracles.json', import.meta.url), 'utf8');
const oracle = JSON.parse(oracleFile);
const fixture = oracle.cases.find(item => item.id === caseId);
assert.ok(fixture && variants.includes(variant), 'Use a fixed case E01–E12 and clear/casual/incomplete');
const perturb = perturbation ? oracle.mutation_perturbations.find(item => item.id === perturbation && item.id.startsWith(`${caseId}.`)) : null;
assert.ok(!perturbation || perturb, 'Unknown fixed perturbation');
const turns = perturb?.turns ? [...perturb.turns] : [...fixture.variants[variants.indexOf(variant)]];
if (perturbation === 'E08.switch-save') turns.unshift('My current external grinder is an Encore ESP and I use its setting 7.');
if (perturbation === 'E11.switch-save') turns.unshift('Use jar 2 for espresso. Let us try 39 grams out, keeping its dose and grind.');
if (perturbation === 'E12.replay') turns.splice(0, turns.length, 'Please save output 39 grams for this bean.');
const variantLabel = perturbation ? perturbation.split('.')[1] : variant;
const runId = Date.now();
const uid = `espresso-live-${caseId.toLowerCase()}-${variantLabel}`;
const model = 'gpt-5.6-luna';
const qaFile = name => new URL(`./${name}`, import.meta.url);
const ledgerFile = qaFile('live-provider-ledger.json');
const ledger = await readFile(ledgerFile, 'utf8').then(JSON.parse).catch(error => {
  if (error.code !== 'ENOENT') throw error;
  return { calls: [], estimatedUsd: 0, pricingRegistry: PRICING_REGISTRY_VERSION, scope: 'This espresso evaluation only; dated local price estimate, not a billing receipt' };
});
const providerCalls = [];
const results = [];
const mutationAttempts = [];
const replays = [];
let faultArmed = false;
let faultConsumed = false;
let failedSaveActionId = null;
let captureMutations = false;
let server;
let initialState;
let terminalError = null;
const app = initializeApp({ projectId });
const auth = getAuth(app);
const db = getFirestore(app);
const snapshot = async () => {
  const collections = {};
  for (const name of ['beans', 'recipeRevisions', 'actions', 'receipts', 'tastings']) {
    const rows = await db.collection(`users/${uid}/${name}`).get();
    collections[name] = Object.fromEntries(rows.docs.map(doc => [doc.id, doc.data()]).sort(([a], [b]) => a.localeCompare(b)));
  }
  return collections;
};
const fetchReal = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (['127.0.0.1', 'localhost'].includes(url.hostname)) return fetchReal(input, init);
  assert.equal(url.origin + url.pathname, 'https://api.openai.com/v1/responses', 'Unexpected external request blocked');
  const body = JSON.parse(init?.body || '{}');
  assert.equal(body.model, model);
  assert.ok(providerCalls.length < 12 && ledger.calls.length < 500, 'Provider call cap reached');
  assert.ok(ledger.estimatedUsd < 5, 'Conservative evaluation cost stop reached');
  assert.ok(Buffer.byteLength(JSON.stringify(body.input)) <= 180000 && body.max_output_tokens <= 2400, 'Provider request cap exceeded');
  const call = { caseId, variant, perturbation, runId, requestIndex: providerCalls.length, requestedModel: body.model, reasoning: body.reasoning, maxOutputTokens: body.max_output_tokens, promptHash: createHash('sha256').update(body.instructions || '').digest('hex'), input: body.input, tools: body.tools?.map(tool => tool.name), status: 'started' };
  providerCalls.push(call);
  const entry = { caseId, variant, perturbation, runId, status: 'started' };
  ledger.calls.push(entry);
  await writeFile(ledgerFile, JSON.stringify(ledger, null, 2) + '\n');
  const response = await fetchReal(input, init);
  const data = await response.clone().json();
  Object.assign(call, { status: data.status || response.status, requestId: data.id, servedModel: data.model, usage: data.usage, output: data.output });
  const priced = priceUsage({ model, provider: 'openai', usage: data.usage });
  const estimate = priced?.costUsd ?? priced?.cost ?? null;
  Object.assign(entry, { status: call.status, requestId: data.id, usage: data.usage, estimatedUsd: estimate });
  if (typeof estimate === 'number') ledger.estimatedUsd += estimate;
  await writeFile(ledgerFile, JSON.stringify(ledger, null, 2) + '\n');
  return response;
};
// Fault is injected immediately before the real transaction's recipe revision
// write; all reads and successful commits still use actual Firestore emulator.
const transactionReal = db.runTransaction.bind(db);
db.runTransaction = async (update, options) => {
  let attempted = false;
  try {
    const result = await transactionReal(async transaction => update(new Proxy(transaction, {
      get(target, key) {
        if (key === 'set' || key === 'create') return (ref, ...args) => {
          if (captureMutations && ref.path.startsWith(`users/${uid}/recipeRevisions/`)) {
            attempted = true;
            if (faultArmed) { faultArmed = false; faultConsumed = true; throw Object.assign(new Error('Synthetic local persistence failure'), { code: 'injected_persistence_failure' }); }
          }
          return target[key](ref, ...args);
        };
        const value = target[key];
        return typeof value === 'function' ? value.bind(target) : value;
      },
    })), options);
    if (attempted) mutationAttempts.push({ outcome: 'committed', state: await snapshot() });
    return result;
  } catch (error) {
    if (attempted) mutationAttempts.push({ outcome: 'failed', code: error.code || 'transaction_failed', state: await snapshot() });
    throw error;
  }
};
try {
  // Read only the one provider credential in memory. No account config is
  // sourced, logged, copied to a receipt, or passed to a shell command.
  const envText = await readFile('/Users/talmeltzer/Documents/VIBE CODING/Coffee-App-Build/.env.local', 'utf8');
  const keyLine = envText.match(/^\s*(?:export\s+)?OPENAI_API_KEY\s*=\s*(.+)\s*$/m);
  assert.ok(keyLine, 'Provider credential unavailable');
  process.env.OPENAI_API_KEY = keyLine[1].trim().replace(/^(['"])(.*)\1$/, '$2');
  Object.assign(process.env, { RUPHUS_AGENT_V3_UIDS: uid, RUPHUS_AGENT_V3_MUTATION_UIDS: uid, RUPHUS_AGENT_MAX_OUTPUT_TOKENS: '2400', RUPHUS_AGENT_EVIDENCE_BYTES: '24000', RUPHUS_AGENT_TRACE_RETENTION_DAYS: '1' });
  const setup = { brewMethod: caseId === 'E02' ? 'v60' : 'espresso', grinder: 'fellow-ode-gen2', espressoMachine: 'breville-barista-express', espressoBasket: 'stock-double-single-wall', espressoGrinder: 'integrated', espressoSetupConfirmed: true };
  await auth.createUser({ uid, email: `${uid}@example.test`, password: 'local-fixture-only-123' });
  await db.doc(`users/${uid}`).set({ preferences: setup, subscription: { status: 'active', plan: 'pro' }, onboardingComplete: true });
  const { executeRecipeCommand } = await import('../../../api/_lib/ruphusCommandService.js');
  let firstRevision;
  for (const [id, name, jarSlot] of [['jar-1', 'Cocoa Garden', 1], ['jar-2', 'Maple Ridge', 2]]) {
    const bean = { id, name, roastLevel: 'medium', roaster: 'Synthetic Test Roaster', origin: jarSlot === 1 ? 'Brazil' : 'Colombia', process: 'washed', jarSlot, status: 'ACTIVE', ownerId: uid };
    await db.doc(`users/${uid}/beans/${id}`).set({ ...bean, handBrewRecipes: { v60: { method: 'v60', device: 'v60', mode: 'hot', coffeeGrams: 15, waterGrams: 250, temperature: 94, ratio: '1:16.67', grind: 4.2 } } });
    const baseline = buildEspressoRecipe({ bean, setup }).recipe;
    const recipe = editEspressoRecipe({ ...baseline, grinderSetting: { ...baseline.grinderSetting, value: 5, source: 'user_saved' } }, {}).recipe;
    assert.equal(recipe.doseGrams, 18); assert.equal(recipe.yieldGrams, 36);
    const saved = await executeRecipeCommand({ db, uid, clientVersion: '1.1.255', actionId: `seed-${id}`, coffeeId: id, slotKey: 'espresso', mode: 'replace_active_recipe', expectedRevisionHash: absentRecipeSourceHash('espresso'), recipe, patch: { espressoRecipe: recipe } });
    if (id === 'jar-1') firstRevision = saved.revision.id;
  }
  const current = (await db.doc(`users/${uid}/beans/jar-1`).get()).data().espressoRecipe;
  const oldSetup = { ...setup, espressoGrinder: 'external', espressoGrinderModel: 'Prior external grinder' };
  const oldRecipe = buildEspressoRecipe({ bean: { id: 'jar-1', roastLevel: 'light' }, setup: oldSetup }).recipe;
  await db.doc(`users/${uid}/tastings/prior-cup`).set({ beanId: 'jar-1', date: new Date(runId - 86400000).toISOString(), notes: 'Cocoa, dry finish. Prior grinder, a different cup.', scores: { sweetness: 4, body: 3 }, actuals: { doseGrams: 17, yieldGrams: 38, elapsedSeconds: 31, timeBasis: 'button_start_including_preinfusion' }, cupContext: { method: 'espresso', drinkType: 'straight', equipment: oldSetup, recipeSnapshot: oldRecipe, recipeRevisionId: 'prior-setup-fixture' } });
  if (caseId === 'E08' && variant === 'incomplete') await db.doc(`users/${uid}`).update({ preferences: { ...setup, espressoBasket: null, espressoGrinder: 'external', espressoGrinderModel: null, espressoSetupConfirmed: false } });
  if (perturbation === 'E08.switch-save') {
    const externalSetup = { ...setup, espressoGrinder: 'external', espressoGrinderModel: 'Encore ESP' };
    await db.doc(`users/${uid}`).update({ preferences: externalSetup });
    const bean = { id: 'jar-1', ...(await db.doc(`users/${uid}/beans/jar-1`).get()).data() };
    const recipe = buildEspressoRecipe({ bean, setup: externalSetup }).recipe;
    const saved = await executeRecipeCommand({ db, uid, actionId: 'seed-external', coffeeId: 'jar-1', slotKey: 'espresso', mode: 'replace_active_recipe', expectedRevisionId: firstRevision, recipe, patch: { espressoRecipe: recipe } });
    firstRevision = saved.revision.id;
  }
  const signedIn = await fetch('http://127.0.0.1:59099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `${uid}@example.test`, password: 'local-fixture-only-123', returnSecureToken: true }) });
  const { idToken } = await signedIn.json();
  assert.equal((await auth.verifyIdToken(idToken, true)).uid, uid);
  const { default: handler } = await import('../../../api/ruphus-agent.js');
  server = createServer(async (req, res) => {
    res.status = code => { res.statusCode = code; return res; };
    res.json = body => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); };
    try { let body = ''; for await (const part of req) body += part; req.body = JSON.parse(body || '{}'); await handler(req, res); }
    catch { if (!res.headersSent) res.status(500).json({ error: 'local_harness_failure' }); else res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  initialState = await snapshot();
  captureMutations = true;
  const conversation = [];
  const contextRef = { surface: 'recipe_espresso', coffeeRef: 'jar-1', launchItem: { kind: 'recipe', ref: firstRevision, method: 'espresso' } };
  for (let index = 0; index < turns.length; index++) {
    if (perturbation === 'E07.stale' && index === 1) {
      captureMutations = false;
      const bean = (await db.doc(`users/${uid}/beans/jar-1`).get()).data();
      const recipe = editEspressoRecipe(bean.espressoRecipe, { yieldGrams: 42 }).recipe;
      await executeRecipeCommand({ db, uid, actionId: 'intervening-direct-edit', coffeeId: 'jar-1', slotKey: 'espresso', mode: 'replace_active_recipe', expectedRevisionId: bean.activeRevisionIds.espresso, recipe, patch: { espressoRecipe: recipe } });
      captureMutations = true;
    }
    const before = await snapshot();
    const providerStart = providerCalls.length;
    const mutationStart = mutationAttempts.length;
    const authorizedSave = (caseId === 'E04' && index === (perturbation === 'E04.grind-only' ? 0 : 1)) || (caseId === 'E06' && index === 2) || (caseId === 'E07' && index === 0) || (caseId === 'E12' && index === turns.length - 1) || (['E08.switch-save', 'E11.switch-save'].includes(perturbation) && index === 1);
    const authorizedUndo = caseId === 'E07' && index === 1 && !['E07.stale', 'E07.negated', 'E07.hypothetical', 'E07.ambiguous'].includes(perturbation);
    const failedSave = caseId === 'E12' && index === turns.length - 2 && perturbation !== 'E12.replay';
    if (failedSave) faultArmed = true;
    const request = { turnId: `${caseId}-${variantLabel}-${runId}-${index}`, contextRef, userText: turns[index], conversation: structuredClone(conversation), commandCapabilities: ['technique_experiment_v1'] };
    const send = () => fetch(`http://127.0.0.1:${server.address().port}/api/ruphus-agent`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` }, signal: AbortSignal.timeout(90000), body: JSON.stringify(request) });
    const response = await send();
    const raw = await response.text();
    const frames = raw.split('\n').filter(Boolean).map(line => JSON.parse(line));
    const text = frames.filter(frame => frame.type === 'text_delta').map(frame => frame.text || frame.delta || '').join('');
    const after = await snapshot();
    const retryAuthority = caseId === 'E12' && !perturbation
      ? await db.doc(`users/${uid}/chatSessions/espresso-retry`).get().then(doc => doc.exists ? doc.data() : null)
      : null;
    const failures = [];
    const check = (condition, message) => { if (!condition) failures.push(message); };
    if (caseId === 'E11' && !perturbation && index === 1) {
      const input = providerCalls[providerStart]?.input || [];
      const binding = (tag) => {
        const content = input.map(item => typeof item.content === 'string' ? item.content : '').join('\n');
        const raw = content.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`))?.[1];
        return raw ? JSON.parse(raw) : null;
      };
      check(binding('TRUSTED_TURN_BINDING')?.coffeeName === 'Maple Ridge', 'Explicit jar2 switch did not establish trusted coffee focus');
      check(binding('TRUSTED_METHOD_BINDING')?.slot === 'v60_hot', 'Explicit V60 switch did not establish trusted method focus');
    }
    const terminals = frames.filter(frame => ['turn_completed', 'turn_interrupted', 'turn_failed'].includes(frame.type));
    const failedTerminal = terminals.length === 1 && recoveryForAgentFrame(terminals[0]);
    // Plan E12 requires a truthful, retryable failed save. The existing chat
    // protocol represents that state with an interrupted/failed terminal.
    // This exception is only for our consumed pre-commit persistence fault;
    // successful saves, retries and response-loss replays must complete.
    const expectedFailure = failedSave && faultConsumed && failedTerminal;
    if (expectedFailure) {
      check(Boolean(failedTerminal.turnId), 'Injected failure lacks the existing retry identity');
      check(/couldn.t|didn.t|failed|unable|unchanged|not saved/i.test(`${text} ${terminals[0].message || ''}`), 'Injected failure lacks visible failure feedback');
      check(!frames.some(frame => frame.type === 'artifact_ready' && ['action_receipt', 'undo_receipt'].includes(frame.artifact?.type) && frame.artifact.status === 'succeeded'), 'Injected failure falsely reports a successful mutation');
    } else {
      check(response.status === 200 && terminals.length === 1 && terminals[0].type === 'turn_completed', 'Actual endpoint turn did not complete');
    }
    check(canonicalHash(after.tastings) === canonicalHash(initialState.tastings), 'Prior tasting changed');
    const targetId = perturbation === 'E11.switch-save' ? 'jar-2' : 'jar-1';
    const otherId = targetId === 'jar-1' ? 'jar-2' : 'jar-1';
    check(canonicalHash(after.beans[otherId]) === canonicalHash(initialState.beans[otherId]), 'Other bean changed');
    for (const id of ['jar-1', 'jar-2']) check(canonicalHash(after.beans[id].handBrewRecipes) === canonicalHash(initialState.beans[id].handBrewRecipes), 'V60 recipe changed');
    if (!authorizedSave && !authorizedUndo) check(canonicalHash(after) === canonicalHash(before), 'Unexpected mutation during advice/correction/failure');
    if (authorizedSave || authorizedUndo) {
      const attempts = mutationAttempts.slice(mutationStart);
      check(attempts.length === 1 && attempts[0].outcome === 'committed' && canonicalHash(attempts[0].state) === canonicalHash(after), 'Missing exact committed mutation-attempt state');
      if (caseId === 'E12' && !perturbation) {
        const receipt = frames.find(frame => frame.type === 'tool_result' && frame.name === 'save_espresso_recipe' && frame.result?.ok)?.result?.receipt;
        check(Boolean(failedSaveActionId) && receipt?.actionId === failedSaveActionId, 'Retry did not reuse the exact failed action identity');
      }
      const expected = authorizedUndo || ['E04.grind-only', 'E08.switch-save'].includes(perturbation) ? 36 : 39;
      const recipe = after.beans[targetId].espressoRecipe;
      const expectedGrind = perturbation === 'E04.grind-only' ? 4 : perturbation === 'E08.switch-save' ? 7 : 5;
      check(recipe?.yieldGrams === expected, `Expected persisted output ${expected}`);
      check(recipe?.doseGrams === 18 && recipe?.grinderSetting?.value === expectedGrind, 'Dose/grind differs from exact requested result');
      check(canonicalHash(recipe?.temperature) === canonicalHash(current.temperature) && canonicalHash(recipe?.timeRangeSeconds) === canonicalHash(current.timeRangeSeconds), 'Unrequested temperature/time change');
      check(Object.keys(after.recipeRevisions).length === Object.keys(before.recipeRevisions).length + 1, 'Expected exactly one new revision');
      for (const [key, prior] of Object.entries(initialState.beans[targetId].espressoRecipesBySetup || {})) {
        if (key !== recipe?.setupKey) check(canonicalHash(after.beans[targetId].espressoRecipesBySetup?.[key]) === canonicalHash(prior), 'Unrelated grinder setup changed');
      }
    }
    if (failedSave) {
      check(faultConsumed, 'Expected persistence fault was not reached');
      const attempts = mutationAttempts.slice(mutationStart);
      check(attempts.length === 1 && attempts[0].outcome === 'failed' && canonicalHash(attempts[0].state) === canonicalHash(before), 'Missing unchanged failed mutation-attempt state');
      failedSaveActionId = retryAuthority?.actionId || null;
      check(retryAuthority?.ownerId === uid && retryAuthority?.status === 'retryable' && Boolean(failedSaveActionId), 'Failed save lacks server-owned exact retry authority');
    }
    if ((perturbation === 'E07.duplicate' && authorizedUndo) || perturbation === 'E12.replay') {
      const replayResponse = await send();
      const replayRaw = await replayResponse.text();
      const replayFrames = replayRaw.split('\n').filter(Boolean).map(line => JSON.parse(line));
      const replayState = await snapshot();
      check(canonicalHash(replayState) === canonicalHash(after), 'Repeated identical turn created another mutation');
      check(replayResponse.status === 200 && replayFrames.some(frame => frame.type === 'turn_completed') && !replayFrames.some(frame => frame.type === 'turn_interrupted'), 'Repeated identical turn did not recover a completed response');
      replays.push({ turn: index, status: replayResponse.status, frames: replayFrames, before: after, after: replayState, fault: perturbation === 'E12.replay' ? 'Harness discards original successful endpoint response then replays identical request; actual commit/session/provider remain real' : null });
    }
    results.push({ index, userText: turns[index], status: response.status, text, frames, before, after, ...(retryAuthority ? { retryAuthority } : {}), failures });
    conversation.push({ role: 'user', content: turns[index] }, { role: 'assistant', content: text, artifacts: frames.filter(frame => frame.type === 'artifact_ready').map(frame => frame.artifact) });
    await writeFile(qaFile(`live-${caseId}-${variantLabel}-${runId}-partial.json`), JSON.stringify({ caseId, variant, perturbation, runId, results, providerCalls, mutationAttempts, replays }, null, 2) + '\n');
    console.log(JSON.stringify({ caseId, variant, turn: index + 1, deterministicFailures: failures.length, providerCalls: providerCalls.length }));
  }
} catch (error) {
  terminalError = error.message;
  process.exitCode = 1;
} finally {
  if (server) await new Promise(resolve => server.close(resolve));
  const finalState = await snapshot().catch(() => null);
  const receipt = { caseId, variant, perturbation, runId, proof: 'Actual authenticated chat endpoint, configured provider, context and tools; local real Auth/Firestore persistence', oracleHash: createHash('sha256').update(oracleFile).digest('hex'), requestedModel: model, outputCap: 2400, evidenceByteCap: 24000, capScope: 'Explicit evaluation config; deployed caps not inferred', status: terminalError || results.some(result => result.failures.length) ? 'failed' : 'deterministic_pass_semantic_review_pending', semanticReview: 'pending independent source-grounded E01–E12 review', terminalError, assertions: perturb?.required || fixture.assertions, initialState, finalState, results, providerCalls, mutationAttempts, replays, fault: { layer: 'Harness proxy immediately before recipe revision transaction.create/set', armed: faultArmed, consumed: faultConsumed }, modelCalls: providerCalls.length };
  await writeFile(qaFile(`live-${caseId}-${variantLabel}-${runId}-receipt.json`), JSON.stringify(receipt, null, 2) + '\n');
  await unlink(qaFile(`live-${caseId}-${variantLabel}-${runId}-partial.json`)).catch(error => { if (error.code !== 'ENOENT') throw error; });
  console.log(JSON.stringify({ caseId, variant, status: receipt.status, modelCalls: providerCalls.length, terminalError }));
  if (receipt.status === 'failed') process.exitCode = 1;
  delete process.env.OPENAI_API_KEY;
  globalThis.fetch = fetchReal;
  await db.terminate(); await deleteApp(app);
}
