// Real App entrypoint and navigation. Only synthetic Auth/Firestore data;
// provider-dependent requests fail locally to exercise recoverable UI states.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer as createViteServer } from 'vite';
import { chromium } from 'playwright';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { buildEspressoRecipe } from '../../../src/lib/espressoRecipes.js';
import { finishTastingSteps } from './browser-tasting-checks.mjs';

const projectId = 'demo-espresso-acceptance';
assert.equal(process.env.GCLOUD_PROJECT, projectId);
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:58080');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:59099');
for (const key of ['FIREBASE_SERVICE_ACCOUNT', 'GOOGLE_APPLICATION_CREDENTIALS', 'OPENAI_API_KEY']) assert.ok(!process.env[key]);
const uid = 'espresso-browser-owner';
process.env.RUPHUS_AGENT_V3_UIDS = uid;
// Deliberately outside generic mutation rollout: espresso edits use ordinary Pro.
const app = initializeApp({ projectId });
const auth = getAuth(app);
const db = getFirestore(app);
const setup = { brewMethod: 'espresso', grinder: 'fellow-ode-gen2', canisterCount: 3, espressoMachine: 'breville-barista-express', espressoBasket: 'stock-double-single-wall', espressoGrinder: 'integrated', espressoSetupConfirmed: true };
const runId = Date.now();
const checks = [], errors = [], requests = [];
const providerCalls = [];
const fetchReal = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (['localhost', '127.0.0.1'].includes(url.hostname)) return fetchReal(input, init);
  assert.equal(url.origin + url.pathname, 'https://api.openai.com/v1/responses');
  const request = JSON.parse(init?.body || '{}');
  assert.equal(request.model, 'gpt-5.6-luna');
  assert.ok(providerCalls.length < 8 && request.max_output_tokens <= 2400);
  const call = { requestedModel: request.model, status: 'started' };
  providerCalls.push(call);
  const response = await fetchReal(input, init);
  const data = await response.clone().json();
  Object.assign(call, { requestId: data.id, servedModel: data.model, status: data.status, usage: data.usage, output: data.output?.filter(item => item.type !== 'reasoning') });
  return response;
};
let server, vite, browser, page;
const evidence = name => new URL(`./app-browser-${runId}-${name}`, import.meta.url);
const readBean = async id => (await db.doc(`users/${uid}/beans/${id}`).get()).data();
const waitForPreferences = async predicate => {
  for (let attempt = 0; attempt < 60; attempt++) {
    const preferences = (await db.doc(`users/${uid}`).get()).data()?.preferences;
    if (predicate(preferences)) return preferences;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.fail('Preference change was not persisted');
};
try {
  const credential = (await readFile('/Users/talmeltzer/Documents/VIBE CODING/Coffee-App-Build/.env.local', 'utf8')).match(/^\s*(?:export\s+)?OPENAI_API_KEY\s*=\s*(.+)\s*$/m);
  assert.ok(credential, 'Provider credential unavailable');
  process.env.OPENAI_API_KEY = credential[1].trim().replace(/^(['"])(.*)\1$/, '$2');
  Object.assign(process.env, { RUPHUS_AGENT_MAX_OUTPUT_TOKENS: '2400', RUPHUS_AGENT_EVIDENCE_BYTES: '24000', RUPHUS_AGENT_TRACE_RETENTION_DAYS: '1' });
  await auth.createUser({ uid, email: 'espresso-browser@example.test', password: 'local-fixture-only-123' });
  await db.doc(`users/${uid}`).set({ displayName: 'Local espresso fixture', username: null, onboardingComplete: true, tourCompleted: true, aiDataConsent: true, preferences: setup, subscription: { status: 'active', plan: 'pro' } });
  for (const [id, name, status] of [['browser-a', 'Cocoa Garden', 'ACTIVE'], ['browser-b', 'Maple Ridge', 'SEALED'], ['browser-c', 'Old Bag', 'FINISHED']]) {
    await db.doc(`users/${uid}/beans/${id}`).set({ name, status, roastLevel: 'medium', ownerId: uid, jarSlot: status === 'ACTIVE' ? 1 : null, roastDate: '2026-10-01', openDate: '2026-10-10', ...(status === 'FINISHED' ? { finishDate: '2026-10-11' } : {}) });
  }
  const { executeRecipeCommand } = await import('../../../api/_lib/ruphusCommandService.js');
  const archivedRecipe = buildEspressoRecipe({ bean: { id: 'browser-c', roastLevel: 'medium' }, setup }).recipe;
  await executeRecipeCommand({ db, uid, actionId: 'seed-archive-espresso', coffeeId: 'browser-c', slotKey: 'espresso', mode: 'replace_active_recipe', recipe: archivedRecipe, patch: { espressoRecipe: archivedRecipe } });
  const { default: handler } = await import('../../../api/recipe-command.js');
  const { default: agentHandler } = await import('../../../api/ruphus-agent.js');
  server = createServer(async (req, res) => {
    res.status = code => { res.statusCode = code; return res; };
    res.json = body => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); };
    try { let body = ''; for await (const part of req) body += part; req.body = JSON.parse(body || '{}'); await (req.url === '/api/ruphus-agent' ? agentHandler : handler)(req, res); }
    catch { if (!res.headersSent) res.status(500).json({ error: 'harness_failure' }); else res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const endpoint = `http://127.0.0.1:${server.address().port}/api/recipe-command`;
  Object.assign(process.env, { VITE_FIREBASE_API_KEY: 'demo-key', VITE_FIREBASE_AUTH_DOMAIN: 'localhost', VITE_FIREBASE_PROJECT_ID: projectId, VITE_FIREBASE_STORAGE_BUCKET: `${projectId}.invalid`, VITE_FIREBASE_MESSAGING_SENDER_ID: '000000000000', VITE_FIREBASE_APP_ID: '1:000000000000:web:espressofixture', TMB_APP_VARIANT: 'dev', npm_package_version: '1.1.255' });
  vite = await createViteServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'warn' });
  await vite.listen();
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) return route.abort();
    if (url.pathname.startsWith('/api/')) {
      const body = route.request().postDataJSON();
      requests.push({ path: url.pathname, ...(url.pathname === '/api/recipe-command' ? { body } : { feature: body?.feature }) });
      if (url.pathname === '/api/recipe-command') return route.fulfill({ response: await route.fetch({ url: endpoint }) });
      if (url.pathname === '/api/ruphus-agent') return route.fulfill({ response: await route.fetch({ url: endpoint.replace('/recipe-command', '/ruphus-agent'), timeout: 90000 }) });
      if (body?.feature === 'beanScan') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: JSON.stringify({ name: 'Scanned Fixture', roaster: 'Synthetic Test Roaster', origin: 'Brazil', roastLevel: 'medium', bagSize: 250 }) }) });
      if (body?.feature === 'webResearch') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ text: '{}' }) });
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Synthetic provider unavailable for browser failure-path test' }) });
    }
    return route.continue();
  });
  page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/docs/qa/espresso-implementation/espresso-app.html`);
  await page.getByRole('button', { name: 'Espresso Recipe', exact: true }).click();
  const output = page.getByRole('spinbutton', { name: 'Espresso output in grams' });
  assert.equal(await output.inputValue(), '36');
  await output.fill('39');
  await page.getByRole('button', { name: 'Save recipe', exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).waitFor();
  assert.equal((await readBean('browser-a')).espressoRecipe.yieldGrams, 39);
  checks.push('Real Rotation opens espresso and saves through authenticated command outside generic mutation rollout');
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await output.scrollIntoViewIfNeeded();
    const box = await output.boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= width + 1);
    assert.ok(await output.evaluate(e => parseFloat(getComputedStyle(e).fontSize)) >= 16);
    await page.screenshot({ path: evidence(`${width}.png`).pathname });
  }
  checks.push('Real App recipe controls fit mobile and desktop widths');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Discuss in chat', exact: true }).click();
  const input = page.getByPlaceholder('Ask Professor Ruphus...');
  await input.fill('Please save output 41 grams for this espresso recipe. Keep dose and grind unchanged.');
  await input.press('Enter');
  const receiptCard = page.locator('[data-artifact="action_receipt"][data-status="succeeded"]').last();
  await receiptCard.getByRole('button', { name: 'View recipe', exact: true }).waitFor({ timeout: 90000 });
  assert.equal((await readBean('browser-a')).espressoRecipe.yieldGrams, 41);
  assert.match(await receiptCard.innerText(), /Output 41 g/);
  await receiptCard.getByRole('button', { name: 'View recipe', exact: true }).click();
  assert.equal(await output.inputValue(), '41');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await receiptCard.getByRole('button', { name: 'Undo', exact: true }).click();
  for (let attempt = 0; attempt < 60 && (await readBean('browser-a')).espressoRecipe.yieldGrams !== 39; attempt++) await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal((await readBean('browser-a')).espressoRecipe.yieldGrams, 39);
  assert.ok(requests.some(r => r.path === '/api/recipe-command' && r.body?.clientIntent === 'espresso_direct_undo'));
  checks.push('Real modal-to-chat handoff, actual provider Save, View recipe and native guarded Undo work outside generic mutation rollout');
  await page.screenshot({ path: evidence('chat-receipt.png').pathname });
  await page.getByRole('button', { name: 'Rotation', exact: true }).click();
  await page.getByRole('button', { name: 'Espresso Recipe', exact: true }).click();
  assert.equal(await output.inputValue(), '39');
  // An unsaved target is a valid cup snapshot, but cannot claim the persisted
  // revision. Exercise the real handoff, draft resume, all eight steps and save.
  await output.fill('40');
  await page.getByRole('button', { name: 'Guided tasting', exact: true }).click();
  await page.getByRole('button', { name: 'Straight espresso', exact: true }).waitFor();
  assert.match(await page.locator('body').innerText(), /40g out/);
  await page.getByRole('button', { name: "Let's taste it", exact: true }).click();
  const sensory = await finishTastingSteps(page, { note: 'Straight espresso: cocoa and a smooth finish.', afterFirstAnswer: async () => {
    // Wait for the real optional AI call to reach the explicit 503 boundary.
    await page.waitForResponse(r => r.url().includes('/api/') && r.request().postData()?.includes('tastingCoach'));
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: 'Leave', exact: true }).click();
    await page.getByRole('button', { name: 'Rotation', exact: true }).click();
    await page.getByRole('button', { name: 'Espresso Recipe', exact: true }).click();
    await output.fill('42');
    await page.getByRole('button', { name: 'Save recipe', exact: true }).click();
    await page.getByRole('button', { name: 'Undo', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('combobox', { name: 'Espresso grinder', exact: true }).selectOption('external');
    await page.getByRole('textbox', { name: 'External espresso grinder model', exact: true }).fill('Encore ESP');
    await page.getByRole('textbox', { name: 'External espresso grinder model', exact: true }).press('Tab');
    await waitForPreferences(p => p?.espressoGrinderModel === 'Encore ESP');
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await page.getByRole('button', { name: 'Tasting', exact: true }).click();
    await page.getByRole('button', { name: 'Resume your Cocoa Garden tasting', exact: true }).click();
    assert.match(await page.locator('[data-wizard-step="smell"] textarea').inputValue(), /Straight espresso/);
  } });
  let straight;
  for (let attempt = 0; attempt < 60; attempt++) {
    const rows = await db.collection(`users/${uid}/tastings`).get();
    straight = rows.docs.find(doc => doc.data().cupContext?.drinkType === 'straight');
    if (straight) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(straight, 'Real wizard must persist its tasting');
  const straightRecord = straight.data();
  assert.equal(straightRecord.cupContext.method, 'espresso');
  assert.equal(straightRecord.cupContext.recipeSnapshot.yieldGrams, 40);
  assert.equal(straightRecord.cupContext.equipment.grinder, 'integrated');
  assert.equal(straightRecord.cupContext.recipeSnapshot.grinderSetting.source, 'unreported');
  assert.ok(straightRecord.cupContext.recipeSnapshot.grinderSetting.value == null, 'Unreported dial must remain unknown rather than inherit a baseline guess');
  assert.equal(straightRecord.cupContext.recipeSnapshot.temperature.offsetF, 0);
  assert.ok(!straightRecord.cupContext.recipeRevisionId, 'Unsaved edited targets cannot claim a saved revision');
  assert.match(straightRecord.notes, /Straight espresso/);
  const scoreKeys = { smell: 'fragranceAroma', acidity: 'acidity', sweetness: 'sweetness', body: 'body', flavor: 'flavor', balance: 'balance' };
  for (const answer of sensory.filter(a => scoreKeys[a.key])) assert.equal(straightRecord.tastingScores[scoreKeys[answer.key]], answer.score);
  assert.ok(!straightRecord.actuals && !straightRecord.cupContext.actuals);
  checks.push('Actual eight-step tasting preserves unsaved cup targets, original grinder, notes and scores across draft resume, newer recipe and grinder changes; optional AI 503 does not block save');
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('combobox', { name: 'Espresso grinder', exact: true }).selectOption('integrated');
  await page.getByRole('checkbox', { name: 'Confirm Barista Express stock basket', exact: true }).click();
  await waitForPreferences(p => p?.espressoGrinder === 'integrated' && p?.espressoSetupConfirmed === true);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Rotation', exact: true }).click();
  await page.getByRole('button', { name: 'Espresso Recipe', exact: true }).click();
  await output.fill('39');
  await page.getByRole('button', { name: 'Save recipe', exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).waitFor();
  const milkRevision = (await readBean('browser-a')).activeRevisionIds.espresso;
  await page.getByRole('button', { name: 'Guided tasting', exact: true }).click();
  await page.getByRole('button', { name: 'With milk', exact: true }).click();
  await page.getByRole('button', { name: "Let's taste it", exact: true }).click();
  assert.equal(await page.locator('[data-wizard-step="smell"] textarea').inputValue(), '', 'A new cup starts with empty observations');
  await finishTastingSteps(page, { note: 'With milk: creamy cocoa, finished drink sweetness.' });
  let milkRecord;
  for (let attempt = 0; attempt < 60; attempt++) {
    const rows = await db.collection(`users/${uid}/tastings`).get();
    milkRecord = rows.docs.map(doc => doc.data()).find(t => t.cupContext?.drinkType === 'with_milk');
    if (milkRecord) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(milkRecord);
  assert.equal(milkRecord.cupContext.recipeRevisionId, milkRevision);
  assert.equal(milkRecord.cupContext.recipeSnapshot.yieldGrams, 39);
  assert.deepEqual((await straight.ref.get()).data(), straightRecord, 'Later recipe and milk tasting cannot rewrite earlier cup');
  await page.screenshot({ path: evidence('tasting-history.png').pathname });
  checks.push('Second milk tasting saves separately with saved revision; prior straight cup is byte-for-byte unchanged and new observations start empty');
  await page.getByRole('button', { name: 'Rotation', exact: true }).click();
  await page.getByRole('button', { name: 'Espresso Recipe', exact: true }).click();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Inventory', exact: true }).click();
  await page.getByRole('button', { name: 'Brew', exact: true }).click();
  assert.equal(await output.inputValue(), '36');
  await output.fill('38');
  await page.getByRole('button', { name: 'Save recipe', exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).waitFor();
  assert.equal((await readBean('browser-b')).espressoRecipe.yieldGrams, 38);
  assert.equal((await readBean('browser-a')).espressoRecipe.yieldGrams, 39);
  checks.push('Real Inventory routes its own bean to espresso and saves independently');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Rotation', exact: true }).click();
  await page.getByRole('button', { name: 'Espresso Recipe', exact: true }).click();
  assert.equal(await output.inputValue(), '39');
  checks.push('Returning through App navigation reopens the saved recipe');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('combobox', { name: 'Espresso grinder', exact: true }).selectOption('external');
  await page.getByRole('textbox', { name: 'External espresso grinder model', exact: true }).fill('Encore ESP');
  await page.getByRole('textbox', { name: 'External espresso grinder model', exact: true }).press('Tab');
  const externalPreferences = await waitForPreferences(p => p?.espressoGrinder === 'external' && p?.espressoGrinderModel === 'Encore ESP');
  assert.equal(externalPreferences.espressoMachine, setup.espressoMachine);
  assert.equal(externalPreferences.espressoBasket, setup.espressoBasket);
  assert.equal(externalPreferences.grinder, 'fellow-ode-gen2');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Tasting', exact: true }).click();
  await page.getByRole('button', { name: 'Start guided tasting', exact: true }).click();
  await page.getByRole('button', { name: 'Straight espresso', exact: true }).waitFor();
  const wizardIntro = page.locator('body > div').filter({ has: page.getByRole('combobox', { name: 'Tasting method', exact: true }) });
  const directContext = await wizardIntro.innerText();
  assert.match(directContext, /Encore ESP/);
  assert.doesNotMatch(directContext, /recipe snapshot 18g in, 39g out/);
  await page.getByRole('combobox', { name: 'Tasting method', exact: true }).selectOption('v60_hot');
  assert.doesNotMatch(await wizardIntro.innerText(), /breville-barista-express|Encore ESP|revision /);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('combobox', { name: 'Espresso grinder', exact: true }).selectOption('integrated');
  await page.getByRole('checkbox', { name: 'Confirm Barista Express stock basket', exact: true }).click();
  await waitForPreferences(p => p?.espressoGrinder === 'integrated' && p?.espressoSetupConfirmed === true);
  checks.push('Existing Settings persists separate external grinder without changing machine, basket or pour-over grinder');
  const method = page.locator('[data-settings-page] select').filter({ has: page.locator('option[value="v60"]') });
  await method.selectOption('v60');
  await waitForPreferences(p => p?.brewMethod === 'v60');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: 'Rotation', exact: true }).click();
  await page.getByRole('button', { name: 'V60 Recipe', exact: true }).click();
  await page.getByRole('button', { name: 'Start brew timer', exact: true }).waitFor();
  assert.equal(await output.count(), 0);
  assert.equal((await readBean('browser-a')).espressoRecipe.yieldGrams, 39);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await method.selectOption('espresso');
  await waitForPreferences(p => p?.brewMethod === 'espresso');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  checks.push('Switching to V60 still opens the existing timed-pour recipe and preserves espresso targets');
  await page.getByRole('button', { name: 'Archive', exact: true }).click();
  await page.getByText('Old Bag', { exact: true }).click();
  await page.getByRole('button', { name: 'VIEW STAT SHEET', exact: true }).click();
  await page.getByText('Brew Profile', { exact: true }).waitFor();
  assert.match(await page.locator('body').innerText(), /18g.*36g out.*1:2/);
  await page.getByRole('button', { name: 'BACK TO CARD', exact: true }).click();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  checks.push('Archive detail retains saved espresso profile without pour-over fallback');
  await page.getByRole('button', { name: 'Rotation', exact: true }).click();
  await page.getByRole('button', { name: 'Quick Recipe', exact: true }).click();
  // Vision result is the explicit fixture boundary. The actual input handler,
  // QuickRecipeFlow, recipe creation and canonical attachment run unchanged.
  await page.locator('body > div:not(#root)').filter({ has: page.getByText('Quick Recipe', { exact: true }) }).locator('input[type=file]').setInputFiles(evidence('390.png').pathname);
  assert.equal(await output.inputValue(), '36');
  await output.fill('40');
  await page.getByRole('button', { name: 'Save recipe', exact: true }).click();
  let scanned;
  for (let attempt = 0; attempt < 60; attempt++) {
    const rows = await db.collection(`users/${uid}/beans`).where('name', '==', 'Scanned Fixture').get();
    scanned = rows.docs.find(doc => doc.data().espressoRecipe);
    if (scanned) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(scanned, 'Post-scan recipe must be attached through real authenticated command');
  assert.equal(scanned.data().espressoRecipe.coffeeId, scanned.id);
  assert.equal(scanned.data().espressoRecipe.yieldGrams, 40);
  assert.ok(!scanned.data().handBrewRecipe && !scanned.data().aidenRecipe);
  checks.push('Post-scan Quick Recipe routes to espresso and attaches edited targets to canonical new bean; vision/enrichment mocked explicitly');
  // Narrow actual-component proof of the pending Save interaction. It uses an
  // explicit held/failing callback transport, not a claimed Firestore outage.
  let releaseSave;
  let saveCalls = 0;
  await context.route('**/fixture-tasting-save', async route => {
    saveCalls += 1;
    if (saveCalls === 1) await new Promise(resolve => { releaseSave = resolve; });
    return route.fulfill({ status: saveCalls === 1 ? 503 : 200, body: '{}' });
  });
  await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/docs/qa/espresso-implementation/tasting-save-fixture.html`);
  const notes = page.getByPlaceholder('In your own words — what did you think of this cup? (optional)');
  await page.getByRole('button', { name: 'Save tasting', exact: true }).click();
  await page.getByRole('button', { name: 'Saving…', exact: true }).waitFor();
  assert.ok(await page.getByRole('button', { name: 'Close', exact: true }).isDisabled());
  assert.ok(await page.getByRole('button', { name: 'Back', exact: true }).isDisabled());
  assert.ok(await notes.evaluate(el => !!el.closest('[inert]')), 'Pending content must reject keyboard edits too');
  for (let attempt = 0; !releaseSave && attempt < 30; attempt++) await new Promise(resolve => setTimeout(resolve, 100));
  assert.ok(releaseSave, 'Fault seam must be reached');
  releaseSave();
  await page.getByRole('button', { name: 'Save tasting', exact: true }).waitFor();
  assert.equal(await notes.inputValue(), 'Keep these observations.');
  await notes.fill('Preserved after failed save.');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Leave', exact: true }).click();
  await page.getByRole('button', { name: 'Resume draft', exact: true }).click();
  assert.equal(await notes.inputValue(), 'Preserved after failed save.');
  await page.getByRole('button', { name: 'Save tasting', exact: true }).click();
  await page.getByRole('button', { name: 'Start guided tasting', exact: true }).waitFor();
  const failureState = JSON.parse(await page.locator('[data-fixture-state]').textContent());
  assert.equal(failureState.draft, null);
  assert.match(failureState.saved.notes, /Preserved after failed save/);
  assert.equal(saveCalls, 2);
  checks.push('Actual tasting wizard blocks pending edits/exit, preserves notes after explicit save failure, resumes and retries without resurrecting a successful draft; component fault seam');
  assert.deepEqual(errors, []);
} catch (error) {
  errors.push(error.message);
  if (page) {
    await page.screenshot({ path: evidence('failure.png').pathname }).catch(() => {});
    await writeFile(evidence('failure.txt'), await page.locator('body').innerText().catch(() => 'UI unavailable'));
  }
  process.exitCode = 1;
} finally {
  await browser?.close(); await vite?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  const persistedTastings = (await db.collection(`users/${uid}/tastings`).get()).docs.map(doc => ({ id: doc.id, ...doc.data() }));
  const finalPreferences = (await db.doc(`users/${uid}`).get()).data()?.preferences || null;
  await db.terminate(); await deleteApp(app);
  delete process.env.OPENAI_API_KEY;
  globalThis.fetch = fetchReal;
  const receipt = { runId, status: errors.length ? 'failed' : 'passed', proof: 'Unchanged main.jsx/App navigation, real client Auth/Firestore, authenticated recipe-command and actual configured provider for chat. Synthetic vision/enrichment responses; optional tasting AI intentionally fails locally. No image-recognition proof claimed.', checks, errors, requests, persistedTastings, finalPreferences, modelCalls: providerCalls.length, providerCalls };
  await writeFile(evidence('receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt));
}
