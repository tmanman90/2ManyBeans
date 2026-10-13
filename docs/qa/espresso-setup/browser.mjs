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
import { finishTastingSteps } from '../espresso-implementation/browser-tasting-checks.mjs';

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
const setup = { brewMethod: 'aiden', grinder: 'fellow-ode-gen2', canisterCount: 3, espressoMachine: null, espressoBasket: null, espressoGrinder: null, espressoSetupConfirmed: false };
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
const evidence = name => new URL(`./browser-${runId}-${name}`, import.meta.url);
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
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', serviceWorkers: 'block', hasTouch: true });
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
  await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/docs/qa/espresso-setup/app.html`);
  const openEspresso = async () => {
    await page.getByRole('button', { name: 'Rotation', exact: true }).click();
    const brewButton = page.getByRole('button', { name: /Brew with.*Aiden/, exact: false }).first();
    await brewButton.scrollIntoViewIfNeeded();
    const b = await brewButton.boundingBox();
    const touch = await context.newCDPSession(page);
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x + b.width / 2, y: b.y + b.height / 2 }] });
    await new Promise(r => setTimeout(r, 550));
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await touch.detach();
    await page.getByRole('button', { name: 'Espresso Recipe', exact: true }).click();
    await page.getByText('Espresso recipe', { exact: true }).waitFor();
  };
  const waitForDose = async value => page.waitForFunction(expected => document.querySelector('input[aria-label="Espresso dose in grams"]')?.value === expected, String(value));
  const dose = page.getByRole('spinbutton', { name: 'Espresso dose in grams' });
  const output = page.getByRole('spinbutton', { name: 'Espresso output in grams' });
  await openEspresso();
  assert.equal(await dose.inputValue(), '');assert.equal(await output.inputValue(), '');
  assert.equal(await page.getByRole('region', { name: 'Espresso recipe', exact: true }).getByRole('button', { name: 'Ask Ruphus', exact: true }).isEnabled(), true);
  assert.equal(await page.getByText('Setup confirmation needed', { exact: true }).count(), 0);
  await page.screenshot({ path: evidence('generic-390.png').pathname });
  checks.push('Aiden default opens useful generic espresso with no invented dose or setup error; chat available');
  await dose.fill('20');await output.press('Tab');
  assert.equal(await output.inputValue(),'40');
  await page.getByRole('button',{name:'Save recipe',exact:true}).click();
  await page.getByRole('button',{name:'Undo saved change',exact:true}).waitFor();
  assert.equal((await readBean('browser-a')).espressoRecipe.doseGrams,20);
  assert.equal((await readBean('browser-a')).espressoRecipe.yieldGrams,40);
  for(const width of [320,390,1280]){
    await page.setViewportSize({width,height:844});await dose.scrollIntoViewIfNeeded();const box=await dose.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width+1);assert.ok(await dose.evaluate(e=>parseFloat(getComputedStyle(e).fontSize))>=16);await page.screenshot({path:evidence(`generic-${width}.png`).pathname});
  }
  await page.setViewportSize({width:390,height:844});
  checks.push('Generic20/40 persists through authenticated command; actual controls fit320/390/1280');
  await page.getByRole('region',{name:'Espresso recipe',exact:true}).getByRole('button',{name:'Ask Ruphus',exact:true}).click();
  const input=page.getByPlaceholder('Ask Professor Ruphus...');
  await input.fill('Aiden is still my default. For this generic espresso recipe, is 20 grams in and 40 out a starting point? Please do not save any changes.');await input.press('Enter');
  await page.waitForResponse(r=>r.url().includes('/api/ruphus-agent'),{timeout:90000});
  await page.getByRole('button',{name:'Rotation',exact:true}).click();
  assert.equal((await readBean('browser-a')).espressoRecipe.yieldGrams,40);
  checks.push('Actual recipe-to-chat handoff and provider advice leave generic recipe unchanged with Aiden default');
  await openEspresso();
  await page.getByRole('button',{name:'Add your machine →',exact:true}).click();
  await page.getByLabel('Espresso machine',{exact:true}).selectOption('other');
  await page.getByLabel('Espresso machine name',{exact:true}).fill('My machine');
  await page.getByText('Basket & grinder',{exact:false}).click();
  await page.getByLabel('Espresso basket',{exact:true}).selectOption('different');
  await page.getByLabel('Espresso basket dose',{exact:true}).fill('20');
  await page.getByLabel('Espresso grinder',{exact:true}).selectOption('external');
  await page.getByLabel('External espresso grinder model',{exact:true}).fill('DF64');
  await page.getByRole('button',{name:'Save equipment',exact:true}).click();
  await waitForPreferences(p=>p.espressoGrinderModel==='DF64'&&p.brewMethod==='aiden'&&p.grinder==='fellow-ode-gen2');
  await page.getByRole('button',{name:'Start a recipe for this equipment',exact:true}).click();
  assert.equal(await dose.inputValue(),'20');assert.equal(await output.inputValue(),'40');
  await page.getByRole('button',{name:'Save recipe',exact:true}).click();
  await page.getByRole('button',{name:'Undo saved change',exact:true}).waitFor();
  const externalRecipe=(await readBean('browser-a')).espressoRecipe;
  assert.equal(externalRecipe.grinderSetting.model,'DF64');assert.equal(externalRecipe.grinderSetting.value,null);assert.equal(externalRecipe.temperature.mode,'unreported');
  assert.ok(Object.keys((await readBean('browser-a')).espressoRecipesBySetup).length>=2);
  checks.push('Inline equipment saves independent espresso preferences, returns to same coffee, preserves earlier recipe and external unknown setting');
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByRole('button',{name:'Edit espresso equipment',exact:true}).click();
  await page.getByLabel('Espresso machine',{exact:true}).selectOption('breville-barista-express');
  await page.getByLabel('Espresso basket',{exact:true}).selectOption('stock-double-single-wall');
  await page.getByLabel('Espresso grinder',{exact:true}).selectOption('external');
  await page.getByRole('button',{name:'Save equipment',exact:true}).click();
  await waitForPreferences(p=>p.espressoSetupConfirmed===true&&p.espressoGrinderModel==='DF64'&&p.brewMethod==='aiden');
  await page.screenshot({path:evidence('settings-aiden-390.png').pathname});
  await page.getByRole('button',{name:'Done',exact:true}).click();
  await openEspresso();
  await page.getByRole('button',{name:'Start a recipe for this equipment',exact:true}).click();
  await waitForDose(18);
  assert.equal(await dose.inputValue(),'18');assert.equal(await output.inputValue(),'36');
  assert.equal(await page.getByText('Setup confirmation needed',{exact:true}).count(),0);
  checks.push('Settings exposes and saves BaristaExpress/stock/external with Aiden default; no confirmation checkbox; verified18/36 available');
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  const beforeCancel=(await db.doc(`users/${uid}`).get()).data().preferences;
  await page.getByRole('button',{name:'Edit espresso equipment',exact:true}).click();
  await page.getByLabel('Espresso machine',{exact:true}).selectOption('other');
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  assert.deepEqual((await db.doc(`users/${uid}`).get()).data().preferences,beforeCancel);
  await page.getByRole('button',{name:'Edit espresso equipment',exact:true}).click();
  await page.getByLabel('Espresso machine',{exact:true}).selectOption('other');
  await page.getByLabel('Espresso machine name',{exact:true}).fill('My pressurised machine');
  await page.getByLabel('Espresso basket',{exact:true}).selectOption('dual-wall');
  await page.getByLabel('Espresso basket dose',{exact:true}).fill('14');
  await page.getByLabel('Espresso grinder',{exact:true}).selectOption('preground');
  await page.getByRole('button',{name:'Save equipment',exact:true}).click();
  await waitForPreferences(p=>p.espressoGrinder==='preground'&&p.brewMethod==='aiden');
  await page.getByRole('button',{name:'Done',exact:true}).click();
  await openEspresso();
  await page.getByRole('button',{name:'Start a recipe for this equipment',exact:true}).click();
  await waitForDose(14);
  assert.equal(await dose.inputValue(),'14');assert.equal(await output.inputValue(),'28');
  await page.getByRole('button',{name:'Taste this coffee',exact:true}).click();
  await page.getByRole('button',{name:'Straight espresso',exact:true}).waitFor();
  await page.getByRole('button',{name:"Let's taste it",exact:true}).click();
  await finishTastingSteps(page,{note:'Generic14/28 espresso: cocoa, with a smooth finish.'});
  const tastings=(await db.collection(`users/${uid}/tastings`).get()).docs.map(x=>x.data());
  const record=tastings.find(x=>x.notes?.includes('Generic14/28'));
  assert.ok(record);assert.equal(record.cupContext.method,'espresso');assert.equal(record.cupContext.recipeSnapshot.doseGrams,14);assert.equal(record.cupContext.recipeSnapshot.yieldGrams,28);assert.equal(record.cupContext.equipment.grinder,'preground');
  assert.equal((await db.doc(`users/${uid}`).get()).data().preferences.brewMethod,'aiden');
  checks.push('Cancel preserves preferences; preground generic14/28 completes real eight-step tasting with immutable espresso context while Aiden stays default');
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.getByRole('button',{name:'Edit espresso equipment',exact:true}).click();
  await page.getByLabel('Espresso machine',{exact:true}).selectOption('unknown');
  await page.getByLabel('Espresso grinder',{exact:true}).selectOption('integrated');
  await page.getByRole('button',{name:'Save equipment',exact:true}).click();
  await waitForPreferences(p=>p.espressoMachine===null&&p.espressoGrinder==='integrated');
  await page.getByRole('button',{name:'Edit espresso equipment',exact:true}).click();
  assert.equal(await page.getByLabel('Espresso grinder',{exact:true}).inputValue(),'integrated');
  await page.getByRole('button',{name:'Save equipment',exact:true}).click();
  assert.equal((await db.doc(`users/${uid}`).get()).data().preferences.espressoGrinder,'integrated');
  assert.equal((await db.doc(`users/${uid}`).get()).data().preferences.brewMethod,'aiden');
  checks.push('An explicitly selected built-in grinder survives reopening and saving before a machine is named');
  assert.deepEqual(errors,[]);
  await page.screenshot({path:evidence('tasting-saved.png').pathname});
}catch(error){process.exitCode=1;errors.push(error.message);if(page)await page.screenshot({path:evidence('failure.png').pathname}).catch(()=>{});}
finally{
 await writeFile(evidence('receipt.json'),JSON.stringify({status:errors.length?'failed':'passed',checks,errors,requests,providerCalls,proof:'Actual App entrypoint/providers, actual Auth/Firestore and recipe-command; synthetic account; one actual configured chat; optional tasting AI unavailable503; browser fixture is not native phone proof'},null,2)+'\n');
 console.log(JSON.stringify({checks:checks.length,errors}));if(browser)await browser.close();if(vite)await vite.close();if(server)await new Promise(r=>server.close(r));delete process.env.OPENAI_API_KEY;globalThis.fetch=fetchReal;await db.terminate();await deleteApp(app);
}
