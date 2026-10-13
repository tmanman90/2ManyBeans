import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { writeFile } from 'node:fs/promises';
import { createServer as createViteServer } from 'vite';
import { chromium } from 'playwright';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const projectId = 'demo-espresso-acceptance';
assert.equal(process.env.GCLOUD_PROJECT, projectId);
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:58080');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:59099');
for (const key of ['FIREBASE_SERVICE_ACCOUNT', 'GOOGLE_APPLICATION_CREDENTIALS', 'OPENAI_API_KEY']) assert.ok(!process.env[key]);
const uid = 'espresso-browser-owner';
process.env.RUPHUS_AGENT_V3_UIDS = uid;
process.env.RUPHUS_AGENT_V3_MUTATION_UIDS = uid;
const app = initializeApp({ projectId });
const auth = getAuth(app);
const db = getFirestore(app);
const setup = { brewMethod: 'espresso', espressoMachine: 'breville-barista-express', espressoBasket: 'stock-double-single-wall', espressoGrinder: 'integrated', espressoSetupConfirmed: true };
const runId = Date.now();
const checks = [];
const errors = [];
const writes = [];
let server, vite, browser, page;
let heldResponse = null;
let holdNextSave = false;
let loseNextSaveResponse = false;
const readBean = async id => (await db.doc(`users/${uid}/beans/${id}`).get()).data();
try {
  await auth.createUser({ uid, email: 'espresso-browser@example.test', password: 'local-fixture-only-123' });
  await db.doc(`users/${uid}`).set({ displayName: 'Local espresso fixture', onboardingComplete: true, preferences: setup, subscription: { status: 'active', plan: 'pro' } });
  for (const [id, name, roastLevel] of [['browser-a', 'Bean A', 'medium'], ['browser-b', 'Bean B', 'dark']]) await db.doc(`users/${uid}/beans/${id}`).set({ name, roastLevel, ownerId: uid });
  const { default: handler } = await import('../../../api/recipe-command.js');
  server = createServer(async (req, res) => {
    res.status = code => { res.statusCode = code; return res; };
    res.json = body => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); };
    try { let body = ''; for await (const part of req) body += part; req.body = JSON.parse(body || '{}'); await handler(req, res); }
    catch { res.status(500).json({ error: 'harness_failure' }); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const endpoint = `http://127.0.0.1:${server.address().port}/api/recipe-command`;
  Object.assign(process.env, { VITE_FIREBASE_API_KEY: 'demo-key', VITE_FIREBASE_AUTH_DOMAIN: 'localhost', VITE_FIREBASE_PROJECT_ID: projectId, VITE_FIREBASE_STORAGE_BUCKET: `${projectId}.invalid`, VITE_FIREBASE_MESSAGING_SENDER_ID: '000000000000', VITE_FIREBASE_APP_ID: '1:000000000000:web:espressofixture', TMB_APP_VARIANT: 'dev', npm_package_version: '1.1.255' });
  vite = await createViteServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'warn' });
  await vite.listen();
  const baseUrl = `http://127.0.0.1:${vite.httpServer.address().port}`;
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) return route.abort();
    if (url.pathname === '/api/recipe-command') {
      const body = request.postDataJSON();
      writes.push({ actionId: body.actionId, coffeeId: body.coffeeId, mode: body.mode });
      const response = await route.fetch({ url: endpoint });
      if (loseNextSaveResponse && body.mode === 'replace_active_recipe') {
        loseNextSaveResponse = false;
        return route.abort('failed');
      }
      if (holdNextSave && body.mode === 'replace_active_recipe') {
        holdNextSave = false;
        await new Promise(resolve => { heldResponse = resolve; });
        heldResponse = null;
      }
      return route.fulfill({ response });
    }
    return route.continue();
  });
  page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${baseUrl}/docs/qa/espresso-implementation/espresso-browser.html`);
  await page.locator('[data-beans-loaded]').filter({ hasText: '2' }).waitFor();
  await page.getByRole('button', { name: 'Open bean A', exact: true }).click();
  const output = page.getByRole('spinbutton', { name: 'Espresso output in grams' });
  await output.waitFor({ timeout: 10000 });
  assert.equal(await output.inputValue(), '36');
  checks.push('StrictMode real hook opens resolved numeric recipe');
  await output.fill('39');
  await page.getByRole('button', { name: 'Save recipe', exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).waitFor();
  assert.equal((await readBean('browser-a')).espressoRecipe.yieldGrams, 39);
  checks.push('Browser edit reaches authenticated endpoint and persisted readback');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="Espresso output in grams"]')?.value === '36');
  assert.ok(!(await readBean('browser-a')).espressoRecipe);
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  assert.equal(await output.inputValue(), '36');
  assert.ok(!(await readBean('browser-a')).espressoRecipe);
  checks.push('First-save Undo restores absence and Refresh does not resurrect deleted targets');
  loseNextSaveResponse = true;
  await output.fill('39');
  await page.getByRole('button', { name: 'Save recipe', exact: true }).click();
  await page.getByRole('alert').waitFor();
  const countAfterLostResponse = (await db.collection(`users/${uid}/recipeRevisions`).get()).size;
  const lostAction = writes.at(-1).actionId;
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).waitFor();
  assert.equal(writes.at(-1).actionId, lostAction);
  assert.equal((await db.collection(`users/${uid}/recipeRevisions`).get()).size, countAfterLostResponse);
  assert.equal((await readBean('browser-a')).espressoRecipe.yieldGrams, 39);
  checks.push('Lost actual Save response retries same action and creates no duplicate revision');
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  assert.equal(await output.inputValue(), '39');
  checks.push('Refresh preserves saved user target');
  await page.screenshot({ path: new URL(`./browser-U2-${runId}-mobile.png`, import.meta.url).pathname });
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Open bean A', exact: true }).click();
  assert.equal(await output.inputValue(), '39');
  checks.push('Reopening reads saved target');
  holdNextSave = true;
  await output.fill('42');
  await page.getByRole('button', { name: 'Save recipe', exact: true }).click();
  for (let i = 0; i < 50 && !heldResponse; i++) await new Promise(resolve => setTimeout(resolve, 50));
  assert.ok(heldResponse, 'response delay must be reached after actual save');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Open bean B', exact: true }).click();
  assert.equal(await output.inputValue(), '32.4');
  heldResponse();
  await page.waitForTimeout(150);
  assert.equal(await page.locator('[data-current-bean]').textContent(), 'browser-b');
  assert.equal(await output.inputValue(), '32.4');
  checks.push('Delayed Save A cannot replace open Bean B');
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await output.scrollIntoViewIfNeeded();
    const box = await output.boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= width + 1);
    const fontSize = await output.evaluate(element => parseFloat(getComputedStyle(element).fontSize));
    assert.ok(fontSize >= 16);
    await page.screenshot({ path: new URL(`./browser-U2-${runId}-${width}.png`, import.meta.url).pathname });
  }
  checks.push('320px and desktop recipe controls fit and inputs remain 16px');
  assert.deepEqual(errors, []);
} catch (error) {
  errors.push(error.message);
  if (page) {
    await page.screenshot({ path: new URL(`./browser-U2-${runId}-failure.png`, import.meta.url).pathname }).catch(() => {});
    await writeFile(new URL(`./browser-U2-${runId}-failure.txt`, import.meta.url), await page.locator('body').innerText().catch(() => 'UI unavailable'));
  }
  process.exitCode = 1;
} finally {
  heldResponse?.();
  await browser?.close();
  await vite?.close();
  if (server) await new Promise(resolve => server.close(resolve));
  await db.terminate(); await deleteApp(app);
  const receipt = { runId, proof: 'Actual React hook and modal under StrictMode, real Firebase client Auth and Firestore emulators, unchanged authenticated recipe-command endpoint; fixture owns surrounding navigation', status: errors.length ? 'failed' : 'passed', checks, errors, writes, modelCalls: 0 };
  await writeFile(new URL(`./browser-U2-${runId}-receipt.json`, import.meta.url), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt));
}
