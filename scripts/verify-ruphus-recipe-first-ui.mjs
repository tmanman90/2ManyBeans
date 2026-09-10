import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { chromium } from 'playwright';
import { runRuphusTurn } from '../api/_lib/ruphusOrchestrator.js';
import { createRuphusTools } from '../api/_lib/ruphusTools.js';
import { generateV60Recipe } from '../src/lib/v60Adapter.js';

const firebaseEnv = {
  VITE_FIREBASE_API_KEY: 'ruphus-harness-not-a-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'ruphus-harness.invalid',
  VITE_FIREBASE_PROJECT_ID: 'ruphus-harness',
  VITE_FIREBASE_STORAGE_BUCKET: 'ruphus-harness.invalid',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '000000000000',
  VITE_FIREBASE_APP_ID: '1:000000000000:web:ruphus-harness',
};
const screenshots = {
  cardMobile: '/tmp/ruphus-recipe-first-preview-card-mobile.png',
  mobile: '/tmp/ruphus-recipe-first-preview-mobile.png',
  desktop: '/tmp/ruphus-recipe-first-preview-desktop.png',
};
let server;
let output = '';
const child = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '0'], { env: { ...process.env, ...firebaseEnv, TMB_APP_VARIANT: 'dev' }, stdio: ['ignore', 'pipe', 'pipe'] });
const collect = (chunk) => { output += chunk.toString(); };
child.stdout.on('data', collect); child.stderr.on('data', collect);
try {
  const baseUrl = await new Promise((resolve, reject) => {
    const ready = () => { const match = output.match(/Local:\s+http:\/\/(127\.0\.0\.1:\d+)\//); if (match) resolve(`http://${match[1]}`); };
    child.stdout.on('data', ready); child.stderr.on('data', ready);
    child.once('exit', (code) => reject(new Error(`Vite exited before fixture startup (${code}): ${output}`)));
  });
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    const writes = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('request', (request) => { if (request.method() !== 'GET') writes.push(`${request.method()} ${request.url()}`); });
    await page.goto(`${baseUrl}/scripts/ruphus-recipe-first-preview-fixture.html`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.clear());
    await page.screenshot({ path: screenshots.cardMobile, fullPage: false });
    await page.getByRole('button', { name: 'View recipe', exact: true }).click();
    await page.getByRole('button', { name: 'Increase coffee dose', exact: true }).click();
    for (let dose = 15; dose <= 20; dose += 1) await page.getByRole('button', { name: 'Increase coffee dose', exact: true }).click();
    assert.match(await page.locator('body').innerText(), /20g/);
    assert.match(await page.locator('body').innerText(), /300g/);
    await page.locator('button[aria-label="Close"]').click();
    await page.waitForTimeout(900);
    assert.equal(await page.locator('[data-start-count]').innerText(), '0');
    assert.equal(await page.locator('[data-save-count]').innerText(), '0');
    assert.deepEqual(writes, []);
    await page.getByRole('button', { name: 'View recipe', exact: true }).click();
    assert.match(await page.locator('body').innerText(), /20g/);
    await page.getByText('Hand Brew Recipe', { exact: true }).waitFor({ state: 'visible' });
    await page.waitForTimeout(1000);
    await page.setViewportSize({ width: 390, height: 1200 });
    await page.getByRole('button', { name: 'Start brew timer', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: screenshots.mobile, fullPage: false });
    await page.getByRole('button', { name: 'Start brew timer', exact: true }).click();
    assert.equal(await page.locator('[data-start-count]').innerText(), '1');
    assert.equal(await page.locator('[data-save-count]').innerText(), '0');
    assert.deepEqual(writes, []);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({ path: screenshots.desktop, fullPage: false });
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ flow: 'passed', ratio: '1:16 → 1:15', dose: '13g → 20g', water: '300g', startCount: 1, saveCount: 0, writes: 0, reducedMotion: true, screenshots }));

    const errorPage = await context.newPage();
    await errorPage.setViewportSize({ width: 390, height: 844 });
    await errorPage.goto(`${baseUrl}/scripts/ruphus-recipe-first-preview-fixture.html?start-stale=1`, { waitUntil: 'domcontentloaded' });
    await errorPage.getByRole('button', { name: 'View recipe', exact: true }).click();
    await errorPage.getByText('Hand Brew Recipe', { exact: true }).waitFor({ state: 'visible' });
    await errorPage.waitForTimeout(1000);
    await errorPage.getByRole('button', { name: 'Start brew timer', exact: true }).scrollIntoViewIfNeeded();
    const startButton = errorPage.getByRole('button', { name: 'Start brew timer', exact: true });
    const saveButton = errorPage.getByRole('button', { name: 'Save recipe', exact: true });
    const startBeforeError = await startButton.boundingBox();
    assert.ok(startBeforeError && startBeforeError.y < 844 && startBeforeError.y + startBeforeError.height > 0, 'Start action must be in the viewport before failure');
    await startButton.click({ force: true });
    const previewError = errorPage.getByRole('alert');
    await previewError.waitFor({ state: 'visible' });
    const errorBox = await previewError.boundingBox();
    const startBox = await startButton.boundingBox();
    const saveBox = await saveButton.boundingBox();
    assert.ok(errorBox && startBox && saveBox, 'Preview error and actions must render');
    assert.ok(errorBox.y < 844 && errorBox.y + errorBox.height > 0, 'Preview error must remain in the viewport after failure');
    assert.ok(errorBox.y + errorBox.height <= startBox.y + 1, 'Preview error must sit above Start action');
    assert.ok(startBox.y - (errorBox.y + errorBox.height) <= 12, 'Preview error must remain adjacent to preview actions');
    assert.ok(saveBox.y >= startBox.y + startBox.height - 1, 'Save action must remain below Start action');
    assert.equal(await startButton.isDisabled(), true, 'Stale preview cannot start a brew');
    assert.equal(await saveButton.isDisabled(), true, 'Stale preview cannot save a recipe');
    assert.equal(await errorPage.getByRole('alert').count(), 1);
    await errorPage.getByRole('button', { name: 'Back to chat', exact: true }).click();
    await errorPage.getByRole('button', { name: 'View recipe', exact: true }).waitFor({ state: 'visible' });
    await errorPage.close();
    const techniquePage = await context.newPage();
    await techniquePage.goto(`${baseUrl}/scripts/ruphus-recipe-first-preview-fixture.html?technique=1`, { waitUntil: 'domcontentloaded' });
    await techniquePage.getByText('Tetsu Kasuya 4:6', { exact: true }).waitFor();
    assert.match(await techniquePage.locator('[data-preview-change]').innerText(), /Technique.*Tetsu Kasuya/);
    await techniquePage.screenshot({ path: '/tmp/ruphus-named-technique-mobile.png' });
    await techniquePage.getByRole('button', { name: 'View recipe', exact: true }).click();
    await techniquePage.getByText('Tetsu Kasuya 4:6 method', { exact: true }).waitFor();
    assert.equal(await techniquePage.locator('[data-start-count]').innerText(), '0');
    assert.equal(await techniquePage.locator('[data-save-count]').innerText(), '0');
    await techniquePage.close();
    // Real deterministic orchestration output rendered through the actual card:
    // provider transport is injected; no live model or account is involved.
    const userText = 'What’s an interesting different V60 technique to try with Jar #1?';
    const turnContext = {
      userText, conversation: [], sessionId: 'rendered-technique-turn',
      rotationSnapshot: { coffees: [{ refKey: 'c1', name: 'Jar #1 coffee', recipes: ['v60_hot'] }], refs: { c1: 'fixture-coffee' } },
      __ruphusRefs: { c1: 'fixture-coffee' },
      proposalState: { target: null, diagnosisReady: false, userAgreed: false, proposalIssued: false },
    };
    const tools = createRuphusTools({ uid: 'rendered-fixture', context: turnContext, readers: { readRecipe: async () => generateV60Recipe({}, { dose: 20 }) } });
    const frames = [];
    let calls = 0;
    const turn = await runRuphusTurn({ turnId: 'rendered-technique', context: turnContext, userText, tools, emit: frame => frames.push(frame), provider: { runTurn: async ({ toolResult }) => {
      calls += 1;
      if (calls === 1) return { toolCalls: [{ callId: 'read', name: 'read_technique_options', args: { coffeeRef: 'c1', slot: 'v60_hot' } }] };
      if (calls === 2) return { text: 'Here is a different approach for your coffee.' };
      const option = toolResult.results.find(item => item.name === 'read_technique_options').result.options[0];
      return { toolCalls: [{ callId: 'prepare', name: 'propose_recipe_change', args: { coffeeRef: 'c1', slot: 'v60_hot', change: null, experiment: { kind: 'v60_technique', techniqueId: option.id } } }] };
    } } });
    assert.equal(turn.ok, true);
    assert.equal(turn.artifacts.length, 1);
    const runtimePage = await context.newPage();
    runtimePage.on('pageerror', error => errors.push(error.message));
    runtimePage.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await runtimePage.addInitScript(data => { window.__ruphusTechniqueTurn = data; }, { userText, frames });
    await runtimePage.goto(`${baseUrl}/scripts/ruphus-recipe-first-preview-fixture.html?technique=1`, { waitUntil: 'domcontentloaded' });
    assert.equal(await runtimePage.locator('[data-artifact="recipe_proposal"]').count(), 0);
    await runtimePage.getByRole('button', { name: 'Send technique request', exact: true }).click();
    await runtimePage.getByRole('button', { name: 'View recipe', exact: true }).waitFor();
    assert.equal(await runtimePage.locator('[data-artifact="recipe_proposal"]').count(), 1);
    assert.ok((await runtimePage.locator('[data-runtime-reply]').innerText()).trim());
    assert.equal(await runtimePage.locator('vite-error-overlay').count(), 0);
    await runtimePage.screenshot({ path: '/tmp/ruphus-same-turn-technique-mobile.png' });
    assert.deepEqual(errors, []);
    console.log('Same-turn deterministic response renders one native recipe card after one user request; live provider/native app not claimed.');
    await runtimePage.close();
    await context.close();
  } finally { await browser.close(); }
} finally {
  if (child && !child.killed) { child.kill('SIGTERM'); await once(child, 'exit').catch(() => {}); }
}
